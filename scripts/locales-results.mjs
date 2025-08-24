/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 import {LitElement, html, css} from "/vendor/lit3/lit-all.min.js";

 class LocalesResults extends LitElement {
  static properties = {
    localesReport: { type: Object },
    ftlComparison: { type: Object },
    betaStartDate: { type: String },
    releaseStartDate: { type: String },
  };

  constructor() {
    super();
    this.localesReport = null;
    this.ftlComparison = null;
  }

  #trainhoppingBlocked() {
    return this.ftlComparison.status == "main-newer";
  }

  #ftlComparison() {
    return html`
      <div id="ftl-comparison">
        ${this.ftlComparison.status == "main-newer" ? html`${this.ftlComparison.message}. An engineer must run <pre>./mach newtab update-locales</pre> and land the resulting change.` : "XPI newtab.ftl is new enough."}
      </div>
    `
  }

  #localesReport() {
    const reportKeys = Object.keys(this.localesReport.locales);
    return html`
      ${reportKeys.map(key => {
        console.log(key);
        return html`
          <details>
            <summary>${key}</summary>
            <p>Missing strings</p>
            <ol>
            ${this.localesReport.locales[key].missing?.["browser/newtab/newtab.ftl"].map(missingFluentKey => {
              return html`<li>${missingFluentKey}</li>`
            })}
            </ol>
          </details>
        `
      })}
    `
  }

  render() {
    if (!this.localesReport || !this.ftlComparison) {
      return null;
    }

    console.log(this.localesReport);
    console.log(this.betaStartDate, this.releaseStartDate);

    return html`
      <link rel="stylesheet" href="./styles/locales-results.css">
      <h1>Locales report</h1>
      <h2 class=${this.#trainhoppingBlocked ? "blocked" : "manual"}>${this.#trainhoppingBlocked ? "Train-hopping is blocked." : "Manual analysis of translated strings required."}</h2>
      ${this.#ftlComparison()}
      ${this.#localesReport()}
    `;
  }
 }

 customElements.define("locales-results", LocalesResults);