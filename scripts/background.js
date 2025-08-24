/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// API endpoints
const FIREFOX_REPO_API = "https://api.github.com/repos/mozilla-firefox/firefox";
const LANDO_GIT2HG_API = "https://lando.moz.tools/api/git2hg/firefox";
const LANDO_HG2GIT_API = "https://lando.moz.tools/api/hg2git/firefox";
const TREEHERDER_API = "https://treeherder.mozilla.org/api";
const TRAIN_SCHEDULE_API = "https://whattrainisitnow.com/api/release/schedule";

/**
 * Handle toolbar button clicks - open the extension page
 */
browser.action.onClicked.addListener(async () => {
  const url = browser.runtime.getURL("index.html");
  await browser.tabs.create({ url });
});

/**
 * Handle messages from the extension page
 */
browser.runtime.onMessage.addListener((message, sender) => {
  return handleMessage(message);
});

/**
 * Routes messages to appropriate handlers
 * @param {Object} message - The message object
 * @returns {Promise<Object>} Response object
 */
async function handleMessage(message) {
  try {
    switch (message.type) {
      case "GET_LATEST_SHA":
        const latestSha = await getLatestSha();
        return { success: true, data: latestSha };
        
      case "VALIDATE_SHA":
        const validatedSha = await validateSha(message.sha);
        return { success: true, data: validatedSha };
        
      case "GET_HG_SHA":
        const hgSha = await getHgSha(message.gitSha);
        return { success: true, data: hgSha };

      case "GET_GIT_SHA":
        const gitSha = await getGitSha(message.hgSha);
        return { success: true, data: gitSha };

      case "GET_PUSH_DATA":
        const pushData = await getPushData(message.hgSha);
        return { success: true, data: pushData };

      case "GET_REVISION_DATA":
        const revisionData = await getRevisionData(message.gitSha);
        return { success: true, data: revisionData };

      default:
        return { success: false, error: "Unknown message type" };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetches the latest commit SHA from the Firefox repository.
 * @returns {Promise<string>} The SHA of the most recent commit
 */
async function getLatestSha() {
  const response = await fetch(`${FIREFOX_REPO_API}/commits`);
  if (!response.ok) {
    throw new Error(`Failed to fetch commits: ${response.status}`);
  }
  
  const commits = await response.json();
  if (!commits || commits.length === 0) {
    throw new Error("No commits found");
  }
  
  return commits[0].sha;
}

/**
 * Validates that a given SHA exists in the Firefox repository.
 * @param {string} sha - The commit SHA to validate
 * @returns {Promise<string>} The validated commit SHA
 */
async function validateSha(sha) {
  const response = await fetch(`${FIREFOX_REPO_API}/commits/${sha}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`SHA ${sha} not found in repository`);
    }
    throw new Error(`Failed to validate SHA: ${response.status}`);
  }
  
  const commit = await response.json();
  return commit.sha;
}

/**
 * Converts a Git SHA to Mercurial SHA using Lando API with browser.storage caching.
 * @param {string} gitSha - The Git commit SHA to convert
 * @returns {Promise<string>} The corresponding Mercurial SHA
 */
async function getHgSha(gitSha) {
  const cacheKey = `git2hg:${gitSha}`;

  // Check browser.storage cache first
  const result = await browser.storage.local.get(cacheKey);
  if (result[cacheKey]) {
    return result[cacheKey];
  }

  // Fetch from Lando API
  const response = await fetch(`${LANDO_GIT2HG_API}/${gitSha}`);
  if (!response.ok) {
    throw new Error(`Failed to convert Git SHA to Mercurial: ${response.status}`);
  }

  const data = await response.json();
  const hgSha = data.hg_hash;
  
  // Cache the result in browser.storage
  await browser.storage.local.set({ [cacheKey]: hgSha });

  return hgSha;
}

/**
 * Converts a Merucial SHA to Git SHA using Lando API with browser.storage caching.
 * @param {string} hgSha - The Mercurial commit SHA to convert
 * @returns {Promise<string>} The corresponding Git SHA
 */
async function getGitSha(hgSha) {
  const cacheKey = `hg2git:${hgSha}`;

  // Check browser.storage cache first
  const result = await browser.storage.local.get(cacheKey);
  if (result[cacheKey]) {
    return result[cacheKey];
  }

  // Fetch from Lando API
  const response = await fetch(`${LANDO_HG2GIT_API}/${hgSha}`);
  if (!response.ok) {
    throw new Error(`Failed to convert Mercurial SHA to Git: ${response.status}`);
  }

  const data = await response.json();
  const gitSha = data.git_hash;
  
  // Cache the result in browser.storage
  await browser.storage.local.set({ [cacheKey]: gitSha });

  return gitSha;
}

/**
 * Gets push data and trainhop jobs from Treeherder for a Mercurial SHA.
 * @param {string} hgSha - The Mercurial commit SHA
 * @returns {Promise<Object>} The push data and trainhop jobs from Treeherder
 */
async function getPushData(hgSha) {
  // First, get the push data to extract the push ID
  const pushResponse = await fetch(`${TREEHERDER_API}/project/mozilla-central/push/?full=true&count=10&revision=${hgSha}`);
  if (!pushResponse.ok) {
    throw new Error(`Failed to fetch push data from Treeherder: ${pushResponse.status}`);
  }
  
  const pushData = await pushResponse.json();
  
  if (!pushData.results || pushData.results.length === 0) {
    throw new Error(`No push data found for Mercurial SHA: ${hgSha}`);
  }
  
  const push = pushData.results[0];
  const pushId = push.id;
  
  // Then, get the trainhop jobs for this push ID
  const jobsResponse = await fetch(`${TREEHERDER_API}/jobs/?job_group_symbol=nt-trainhop&push_id=${pushId}`);
  if (!jobsResponse.ok) {
    throw new Error(`Failed to fetch trainhop jobs from Treeherder: ${jobsResponse.status}`);
  }
  
  const jobsData = await jobsResponse.json();
  
  // Transform job arrays into objects using property names
  const trainhopJobs = transformJobsData(jobsData);
  
  return {
    push: push,
    trainhopJobs: trainhopJobs
  };
}

/**
 * Transforms Treeherder jobs data from array format to object format.
 * Maps job_property_names to corresponding indices in each result array.
 * @param {Object} jobsData - The raw jobs data from Treeherder
 * @returns {Array<Object>} Array of job objects with named properties
 */
function transformJobsData(jobsData) {
  if (!jobsData.results || !jobsData.job_property_names) {
    return [];
  }
  
  const propertyNames = jobsData.job_property_names;
  
  return jobsData.results.map(jobArray => {
    const jobObject = {};
    
    propertyNames.forEach((propertyName, index) => {
      jobObject[propertyName] = jobArray[index];
    });
    
    return jobObject;
  });
}

/**
 * Fetches the Beta and Release merge dates from whattrainisitnow.com API.
 * @returns {Promise<{betaStartDate: string|null, releaseStartDate: string|null}>} The merge dates
 */
async function getBetaAndReleaseDates() {
  try {
    const [betaResponse, releaseResponse] = await Promise.all([
      fetch(`${TRAIN_SCHEDULE_API}/?version=beta`),
      fetch(`${TRAIN_SCHEDULE_API}/?version=release`)
    ]);

    let betaStartDate = null;
    let releaseStartDate = null;

    if (betaResponse.ok) {
      const betaData = await betaResponse.json();
      let betaStartDateObj = Temporal.PlainDate.from(betaData.merge_day);
      betaStartDate = betaStartDateObj.toString();
    }

    // The release query needs to be different because the endpoint doesn't
    // actually tell us the merge-to-beta date for the version on the release
    // channel. We guesstimate it by getting at the build date for the first
    // beta of that version, and finding the last prior Monday.
    if (releaseResponse.ok) {
      const releaseData = await releaseResponse.json();
      let releaseStartDateObj =  Temporal.PlainDate.from(releaseData.beta_1);
      const delta = (releaseStartDateObj.dayOfWeek + 6) % 7; // 0 if Monday, …, 6 if Sunday
      releaseStartDate = releaseStartDateObj.subtract({ days: delta }).toString();
    }

    return { betaStartDate, releaseStartDate };
  } catch (error) {
    console.warn('Failed to fetch merge dates from API:', error);
    return { betaStartDate: null, releaseStartDate: null };
  }
}

/**
 * Gets all revision data in parallel for train-hop assessment.
 * @param {string} gitSha - The Git commit SHA
 * @returns {Promise<Object>} All revision data including files and push info
 */
async function getRevisionData(gitSha) {
  // Convert Git SHA to Mercurial SHA first
  const hgSha = await getHgSha(gitSha);

  // Fetch all data in parallel
  const [pushData, newtabFtlInfo, webextGlueFtlInfo, localesReport, mergeDates] = await Promise.all([
    getPushData(hgSha),
    getGitHubFileInfo(gitSha, "browser/locales/en-US/browser/newtab/newtab.ftl"),
    getGitHubFileInfo(gitSha, "browser/extensions/newtab/webext-glue/locales/en-US/browser/newtab/newtab.ftl"),
    getGitHubFile(gitSha, "browser/extensions/newtab/webext-glue/locales/locales-report.json"),
    getBetaAndReleaseDates()
  ]);

  // Compare the last modified dates of the two newtab.ftl files
  const ftlComparison = compareNewtabFtlFileInfos(newtabFtlInfo, webextGlueFtlInfo);

  return {
    gitSha,
    hgSha,
    pushData,
    ftlComparison,
    localesReport: JSON.parse(localesReport.decodedContent),
    betaStartDate: mergeDates.betaStartDate,
    releaseStartDate: mergeDates.releaseStartDate,
  };
}

/**
 * Fetches a file from the Firefox GitHub repository at a specific commit.
 * @param {string} gitSha - The Git commit SHA
 * @param {string} filePath - The path to the file in the repository
 * @returns {Promise<Object>} The file data from GitHub API
 */
async function getGitHubFile(gitSha, filePath) {
  const response = await fetch(`${FIREFOX_REPO_API}/contents/${filePath}?ref=${gitSha}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${filePath} at ${gitSha}`);
    }
    throw new Error(`Failed to fetch file ${filePath}: ${response.status}`);
  }

  const fileData = await response.json();

  // Decode base64 content if it's a file (not a directory)
  if (fileData.type === "file" && fileData.content) {
    fileData.decodedContent = atob(fileData.content.replace(/\n/g, ""));
  }

  return fileData;
}

/**
 * Fetches file information (as opposed to the file contents) from the Firefox
 * GitHub repository at a specific commit.
 * @param {string} gitSha - The Git commit SHA
 * @param {string} filePath - The path to the file in the repository
 * @returns {Promise<Object>} The file data from GitHub API
 */
async function getGitHubFileInfo(gitSha, filePath) {
  const response = await fetch(`${FIREFOX_REPO_API}/commits?sha=${gitSha}&path=${filePath}&per_page=1`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Failed to find commit data for file SHA ${fileData.sha}`);
    }
    throw new Error(`Failed to fetch file info ${filePath}: ${response.status}`);
  }

  const [commitInfo] = await response.json();

  return {
    path: filePath,
    lastModifiedDate: commitInfo.commit.author.date,
  }
}


/**
 * Compares the last modified dates of the main and webext-glue newtab.ftl files.
 * @param {Object} newtabFtlInfo - Main newtab.ftl file data from GitHub API
 * @param {Object} webextGlueFtlInfo - Webext-glue newtab.ftl file data from GitHub API
 * @returns {Object} Comparison result with dates and sync status
 */
function compareNewtabFtlFileInfos(newtabFtlInfo, webextGlueFtlInfo) {
  const mainLastModified = new Date(newtabFtlInfo.lastModifiedDate);
  const webextLastModified = new Date(webextGlueFtlInfo.lastModifiedDate);

  const timeDiff = mainLastModified.getTime() - webextLastModified.getTime();
  const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
  
  let status = "in-sync";
  let message = "Files are in sync";
  
  if (timeDiff > 0) {
    status = "main-newer";
    message = `Main newtab.ftl is ${Math.abs(daysDiff)} day(s) newer than webext-glue version`;
  } else if (timeDiff < 0) {
    status = "webext-newer";
    message = `Webext-glue newtab.ftl is ${Math.abs(daysDiff)} day(s) newer than main version`;
  }

  return {
    status,
    message,
    daysDiff
  };
}