/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {LitElement, html, css} from "/vendor/lit3/lit-all.min.js";
import "./jobs-report.mjs";
import "./locales-results.mjs";
import "./rollouts-report.mjs";

const SHA_TYPE_HG = "hg";
const SHA_TYPE_GIT = "git";

class TrainCheckApp extends LitElement {

  static properties = {
    sha: { type: String },
    loading: { type: Boolean },
    results: { type: Object },
    shaType: { type: Number },
  };

  constructor() {
    super();
    this.sha = '';
    this.loading = false;
    this.results = null;
    this.shaType = SHA_TYPE_HG;
  }

  render() {
    return html`
      <link rel="stylesheet" href="./styles/train-check-app.css">
      <h1>New Tab Train-hop Station</h1>
      
      <div class="input-section">
        <label for="sha-input">Revision SHA (leave empty for latest):</label>
        <input 
          id="sha-input"
          type="text"
          .value=${this.sha}
          @input=${this.#onShaInput}
          placeholder="Enter Firefox ${this.shaType == SHA_TYPE_HG ? "Mercurial" : "Git"} commit SHA or leave empty for latest"
        />
        <fieldset id="sha-type-holder">
          <input type="radio" name="sha-type" value="${SHA_TYPE_HG}" @change=${this.#onChangeSHAType} ?checked=${this.shaType == SHA_TYPE_HG}>Use Mercurial SHA</input>
          <input type="radio" name="sha-type" value="${SHA_TYPE_GIT}" @change=${this.#onChangeSHAType} ?checked=${this.shaType == SHA_TYPE_GIT}>Use GitHub SHA</input>
        </fieldset>
        <button @click=${this.#checkTrainStatus} ?disabled=${this.loading}>
          ${this.loading ? 'Checking...' : 'Check Train Status'}
        </button>
      </div>

      ${this.results ? html`
        <div class="results">
          <h2>Train Check Results</h2>
          <p>Git SHA: ${this.results.sha}</p>
          ${this.results.hgSha ? html`<p>Mercurial SHA: ${this.results.hgSha}</p>` : ''}
          <p>Status: ${this.results.status}</p>
          <report-summary .results=${this.results}></report-summary>
          <jobs-report .pushData=${this.results.revisionData.pushData}></jobs-report>
          <rollouts-report .rollouts=${this.results.revisionData.rolloutData}></rollouts-report>
          <locales-results .betaStartDate=${this.results.revisionData.betaStartDate} .releaseStartDate=${this.results.revisionData.releaseStartDate} .localesReport=${this.results.revisionData.localesReport} .ftlComparison=${this.results.revisionData.ftlComparison} .sha=${this.results.sha}></locales-results>
        </div>
      ` : ''}
    `;
  }

  /**
   * Handles input changes for the SHA type radio fields.
   * @param {Event} e - The change event
  */
  #onChangeSHAType(e) {
    this.shaType = e.target.value;
  }

  /**
   * Handles input changes for the SHA text field.
   * @param {Event} e - The input event
   */
  #onShaInput(e) {
    this.sha = e.target.value;
  }

  /**
   * Prompts the user for a date with validation.
   * @param {string} description - Description of the date being requested
   * @param {string} type - Type of date (Beta/Release) for error messages
   * @returns {Promise<string|null>} The validated date or null if cancelled
   */
  async #promptForDate(description, type) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    while (true) {
      const dateInput = prompt(`Failed to fetch ${description} automatically. Please enter the ${description} (YYYY-MM-DD):`);
      
      if (dateInput === null) {
        // User cancelled
        return null;
      }
      
      if (dateRegex.test(dateInput)) {
        const date = new Date(dateInput + 'T00:00:00Z');
        if (!isNaN(date.getTime())) {
          return dateInput;
        }
      }
      
      // Invalid date format, ask again
      alert('Invalid date format. Please use YYYY-MM-DD format (e.g., 2024-01-15).');
    }
  }

  /**
   * Initiates the train-hop status check for the provided or latest SHA.
   */
  async #checkTrainStatus() {
    this.loading = true;
    
    try {
      const { gitSha, hgSha } = await this.#resolveSha();

      // If no SHA was provided, populate the input with the fetched SHA
      if (!this.sha.trim()) {
        this.sha = gitSha;
      }

      let revisionData = await this.#getRevisionData(gitSha);
      
      // Handle case where Beta start date couldn't be fetched
      if (revisionData.betaStartDate === null) {
        revisionData.betaStartDate = await this.#promptForDate('Beta start date', 'Beta');
        if (revisionData.betaStartDate === null) {
          this.results = {
            sha: gitSha,
            hgSha: hgSha,
            status: "Error: Beta start date required for locales analysis"
          };
          return;
        }
      }

      // Handle case where Release start date couldn't be fetched
      if (revisionData.releaseStartDate === null) {
        revisionData.releaseStartDate = await this.#promptForDate('Release start date (when current release version first merged to Beta)', 'Release');
        if (revisionData.releaseStartDate === null) {
          this.results = {
            sha: gitSha,
            hgSha: hgSha,
            status: "Error: Release start date required for locales analysis"
          };
          return;
        }
      }
      
      console.log(revisionData);

      this.results = {
        sha: gitSha,
        hgSha: hgSha,
        revisionData,
        status: "Ready for implementation"
      };
    } catch (error) {
      this.results = {
        sha: this.sha || 'unknown',
        status: `Error: ${error.message}`
      };
    }
    
    this.loading = false;
  }

  /**
   * Resolves the SHA to use for train-hop checking.
   * If a SHA is provided, validates it exists in the repo.
   * If no SHA is provided, fetches the latest commit SHA.
   * @returns {Promise<string>} The resolved commit SHA
   */
  async #resolveSha() {
    if (this.sha.trim()) {
      // If we've been given a Mercurial SHA, convert this to a GitHub SHA first,
      // before validating.
      let shaToCheck = this.sha.trim();

      if (this.shaType == SHA_TYPE_HG) {
        const response = await browser.runtime.sendMessage({
          type: "GET_GIT_SHA",
          hgSha: shaToCheck,
        });
        if (response.success) {
          shaToCheck = response.data;
        } else {
          throw new Error(response.error);
        }
      }

      // We've now normalized shaToCheck to be a Git SHA.
      const gitSha = shaToCheck;
      const hgSha = await this.#getHgSha(gitSha)
      // Let us now validate that the provided Git SHA exists on GitHub.
      if (await this.#validateSha(gitSha)) {
        return { gitSha, hgSha };
      }
    } else {
      // Get latest commit SHA
      return await this.#getLatestSha();
    }
  }

  /**
   * Fetches the latest commit SHA from the Firefox repository via background service worker.
   * @returns {Promise<string>} The SHA of the most recent commit
   */
  async #getLatestSha() {
    const latestSHAResponse = await browser.runtime.sendMessage({
      type: "GET_LATEST_SHA"
    });

    if (!latestSHAResponse.success) {
      throw new Error(latestSHAResponse.error);
    }

    this.shaType = SHA_TYPE_GIT;
    const gitSha = latestSHAResponse.data;

    const hgSha = await this.#getHgSha(gitSha)

    return { gitSha, hgSha };
  }

  /**
   * Validates that a given SHA exists in the Firefox repository via background service worker.
   * @param {string} sha - The commit SHA to validate
   * @returns {Promise<string>} The validated commit SHA
   */
  async #validateSha(sha) {
    const response = await browser.runtime.sendMessage({
      type: "VALIDATE_SHA",
      sha: sha
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    return response.data;
  }

  /**
   * Converts a Git SHA to Mercurial SHA using background service worker with browser.storage caching.
   * @param {string} gitSha - The Git commit SHA to convert
   * @returns {Promise<string>} The corresponding Mercurial SHA
   */
  async #getHgSha(gitSha) {
    const response = await browser.runtime.sendMessage({
      type: "GET_HG_SHA",
      gitSha: gitSha
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }

    return response.data;
  }

  /**
   * Gets push data and trainhop jobs from Treeherder via background service worker.
   * @param {string} hgSha - The Mercurial commit SHA
   * @returns {Promise<Object>} The push data and trainhop jobs
   */
  async #getPushData(hgSha) {
    const response = await browser.runtime.sendMessage({
      type: "GET_PUSH_DATA",
      hgSha: hgSha
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    return response.data;
  }

  /**
   * Gets data about the selected revision from the GitHub repository,
   * specifically information about the state of the newtab.ftl Fluent files.
   *
   * @param {string} gitSha - The Git commit SHA
   * @returns {Promise<Object>} The Fluent file information (TODO: flesh that out)
   */
  async #getRevisionData(gitSha) {
    const response = await browser.runtime.sendMessage({
      type: "GET_REVISION_DATA",
      gitSha
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    return response.data;
  }
}

customElements.define("train-check-app", TrainCheckApp);