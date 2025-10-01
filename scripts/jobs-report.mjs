/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {LitElement, html, css} from "/vendor/lit3/lit-all.min.js";

const BETA_JOB_SYMBOL = "Mbc-beta";
const RELEASE_JOB_SYMBOL = "Mbc-release";
const SYMBOL_MAP = {
  "unknown": "\u{1F7E1}",
  "passing": "\u{1F7E2}",
  "failing": "\u{1F534}",
}

 class JobsReport extends LitElement {
  static properties = {
    pushData: { type: Object },
  };

  constructor() {
    super();
    this.pushData = null;
  }

  #renderPlatformRow(platform, platformSummary) {
    const BETA_SYMBOL = SYMBOL_MAP[platformSummary[BETA_JOB_SYMBOL]];
    const RELEASE_SYMBOL = SYMBOL_MAP[platformSummary[RELEASE_JOB_SYMBOL]];
    return html`
      <tr>
        <td>${platform}</td>
        <td><span title="${platformSummary[BETA_JOB_SYMBOL]}">${BETA_SYMBOL}</span></td>
        <td><span title="${platformSummary[RELEASE_JOB_SYMBOL]}">${RELEASE_SYMBOL}</span></td>
      </tr>
    `;
  }

  render() {
    const platforms = Object.keys(this.pushData.summary);

    return html`
      <link rel="stylesheet" href="./styles/jobs-report.css">
      <h1>Train-hop Compatibility Jobs report</h1>
      <table>
        <thead>
          <th>Platform</th>
          <th>Beta</th>
          <th>Release</th>
        </thead>
        <tbody>
          ${platforms.map(platform => {
            return this.#renderPlatformRow(platform, this.pushData.summary[platform]);
          })}
        </tbody>
      </table>
    `;
  }
 }

 customElements.define("jobs-report", JobsReport);