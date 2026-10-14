/**
 * @file releaseWorkflow.test.ts
 * Guards the GitHub Release half of the APK pipeline.
 *
 * Why this exists: the release job used to run only for `v*` tag pushes, so a
 * manual "Actions → Build APK → Run workflow" always skipped it — which is why
 * every release meant downloading the APK from the Artifacts list by hand. The
 * fix is a `publish_release` input plus a tag-resolution step, and the only
 * proof of either is a workflow run on GitHub. These tests assert the contract
 * from the workflow source itself, including the tag validation regex, which is
 * extracted and exercised for real.
 *
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import appJson from "../app.json";

const WORKFLOW_PATH = path.join(process.cwd(), ".github", "workflows", "build-apk.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

/** The text of one top-level job, from its `name:` line to the next job. */
function jobBlock(name: string): string {
  const start = workflow.search(new RegExp(`^  ${name}:$`, "m"));
  assert.notEqual(start, -1, `job "${name}" must exist`);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/^  [a-zA-Z]/m);
  return next === -1 ? rest : rest.slice(0, next);
}

const releaseJob = jobBlock("release");
const dispatchInputs = jobBlock("workflow_dispatch");

describe("manual dispatch can publish a release", () => {
  it("offers publish_release, release_tag and prerelease inputs", () => {
    for (const input of ["publish_release", "release_tag", "prerelease"]) {
      assert.match(dispatchInputs, new RegExp(`^      ${input}:`, "m"), `missing input ${input}`);
    }
  });

  it("keeps the build-only inputs it already had", () => {
    for (const input of ["abis", "artifact"]) {
      assert.match(dispatchInputs, new RegExp(`^      ${input}:`, "m"));
    }
  });

  it("defaults the release switch to off, so a plain build stays a build", () => {
    const block = dispatchInputs.slice(dispatchInputs.indexOf("publish_release:"));
    assert.match(block.slice(0, 200), /type: boolean\n\s+default: false/);
  });

  it("runs the release job on a version tag OR a manual publish", () => {
    const condition = releaseJob.match(/^    if: (.*)$/m)?.[1] ?? "";
    assert.match(condition, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
    assert.match(condition, /github\.event_name == 'workflow_dispatch'/);
    assert.match(condition, /inputs\.publish_release/);
  });

  it("still depends on a successful build and keeps write access to releases", () => {
    assert.match(releaseJob, /^    needs: build$/m);
    assert.match(releaseJob, /^    permissions:\n      contents: write/m);
  });

  it("downloads every artifact into one directory", () => {
    assert.match(releaseJob, /merge-multiple: true/);
  });

  it("creates the tag at the commit the run built", () => {
    assert.match(releaseJob, /--target "\$GITHUB_SHA"/);
  });

  it("falls back to the app version for a manual tag", () => {
    assert.match(releaseJob, /require\('\.\/app\.json'\)\.expo\.version/);
    assert.match(appJson.expo.version, /^\d+\.\d+\.\d+$/);
  });

  it("refuses to publish when no installable artifact came through", () => {
    assert.match(releaseJob, /No APK\/AAB in the downloaded artifacts/);
  });
});

describe("release tag validation", () => {
  // Exercise the shipped regex rather than a copy of it.
  const extracted = workflow.match(/grep -Eq '([^']+)'/);
  assert.ok(extracted, "the tag step must validate the tag with grep -E");
  const tagPattern = new RegExp(extracted[1]);

  it("accepts release tags and pre-release suffixes", () => {
    for (const tag of ["v1.0.0", "v10.20.30", "v2.5.0-beta.1", "v1.2.3-rc.2"]) {
      assert.equal(tagPattern.test(tag), true, `${tag} should be publishable`);
    }
  });

  it("rejects anything that is not v<major>.<minor>.<patch>", () => {
    for (const tag of ["", "1.2.3", "v1.2", "v1.2.3.4", "release-notes", "v1.2.3;rm -rf /", "vx.y.z"]) {
      assert.equal(tagPattern.test(tag), false, `${tag} must be refused`);
    }
  });
});
