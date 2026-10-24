/**
 * GitHub integration via Octokit (architecture §4a). GITHUB_TOKEN is read from
 * env only and is never logged or embedded in errors (architecture §6).
 */
import { Octokit } from "@octokit/rest";
import { spawn } from "node:child_process";

export interface PrHead {
  owner: string;
  repo: string;
  branch: string;
  number: number;
  baseOwner: string;
  baseRepo: string;
}

/** Parse https://github.com/<owner>/<repo>/pull/<n> into its parts. */
export function parsePrUrl(prUrl: string): { owner: string; repo: string; number: number } {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`Not a valid GitHub PR URL: ${prUrl}`);
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
}

export class GitHub {
  private readonly octokit: Octokit;
  constructor(private readonly token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /** Resolve the PR's head repo/branch (where the student's fix lives). */
  async resolvePrHead(prUrl: string): Promise<PrHead> {
    const { owner, repo, number } = parsePrUrl(prUrl);
    try {
      const pr = await this.octokit.pulls.get({ owner, repo, pull_number: number });
      const head = pr.data.head;
      return {
        owner: head.repo?.owner?.login ?? owner,
        repo: head.repo?.name ?? repo,
        branch: head.ref,
        number,
        baseOwner: owner,
        baseRepo: repo,
      };
    } catch (err) {
      throw new Error(`Could not resolve PR ${owner}/${repo}#${number}: ${this.safe(err)}`);
    }
  }

  /** Shallow-clone the PR head branch into `dir`. Token is injected only into the URL. */
  async shallowClone(head: PrHead, dir: string): Promise<void> {
    const url = `https://x-access-token:${this.token}@github.com/${head.owner}/${head.repo}.git`;
    await this.git(["clone", "--depth", "1", "--branch", head.branch, url, dir], {
      // Never let the token-bearing URL leak into logs.
      redact: url,
    });
    // Remove the token-bearing remote so it never persists on disk.
    await this.git(["-C", dir, "remote", "remove", "origin"]).catch(() => {});
  }

  /** Get the PR unified diff. */
  async getDiff(prUrl: string): Promise<string> {
    const { owner, repo, number } = parsePrUrl(prUrl);
    const res = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: number,
      mediaType: { format: "diff" },
    });
    // With the diff media type, data is the raw diff string.
    return res.data as unknown as string;
  }

  /** Post a comment on the PR; return its html_url, or null on failure. */
  async postComment(prUrl: string, body: string): Promise<string | null> {
    const { owner, repo, number } = parsePrUrl(prUrl);
    try {
      const res = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body,
      });
      return res.data.html_url;
    } catch (err) {
      // Record the reason without a secret; caller leaves reviewCommentUrl null.
      console.warn(`Failed to post PR comment: ${this.safe(err)}`);
      return null;
    }
  }

  /**
   * Commit the current working-tree changes in `workspacePath` onto a fresh
   * branch and push it to origin. The token is injected only into the push URL
   * (never logged) and the token-bearing remote is removed afterwards.
   */
  async pushWorkspaceBranch(
    workspacePath: string,
    branch: string,
    owner: string,
    repo: string,
    commitMessage: string,
  ): Promise<void> {
    const pushUrl = `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`;
    // Create (or reset to) the branch, stage everything, commit, and push.
    await this.git(["-C", workspacePath, "checkout", "-B", branch]);
    await this.git(["-C", workspacePath, "add", "-A"]);
    // Commit may be empty if nothing changed; tolerate that so grading proceeds.
    await this.git(["-C", workspacePath, "commit", "-m", commitMessage]).catch(() => {});
    await this.git(["-C", workspacePath, "push", "-f", pushUrl, `HEAD:${branch}`], {
      redact: pushUrl,
    });
  }

  /**
   * Open a PR (or reuse an existing open one) from `head` into `base`.
   * Returns the PR html_url and number.
   */
  async openPr(opts: {
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body?: string;
  }): Promise<{ number: number; htmlUrl: string }> {
    try {
      const res = await this.octokit.pulls.create({
        owner: opts.owner,
        repo: opts.repo,
        head: opts.head,
        base: opts.base,
        title: opts.title,
        body: opts.body ?? "",
      });
      return { number: res.data.number, htmlUrl: res.data.html_url };
    } catch (err) {
      // A PR for this head may already exist — reuse the open one.
      const existing = await this.octokit.pulls
        .list({ owner: opts.owner, repo: opts.repo, state: "open", head: `${opts.owner}:${opts.head}` })
        .catch(() => null);
      const pr = existing?.data?.[0];
      if (pr) return { number: pr.number, htmlUrl: pr.html_url };
      throw new Error(`Could not open PR ${opts.head} -> ${opts.base}: ${this.safe(err)}`);
    }
  }

  /** The repo URL's owner/repo, parsed from an https origin like the demo repo. */
  static parseRepoUrl(url: string): { owner: string; repo: string } {
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/);
    if (!m) throw new Error(`Not a parseable GitHub repo URL: ${url}`);
    return { owner: m[1]!, repo: m[2]! };
  }

  /** Redact the token from any error text. */
  private safe(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.split(this.token).join("***");
  }

  private git(args: string[], opts?: { redact?: string }): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn("git", args, { env: process.env });
      let stderr = "";
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code === 0) return resolvePromise();
        const safe = opts?.redact ? stderr.split(opts.redact).join("***") : stderr;
        reject(new Error(`git ${args[0]} failed (${code}): ${safe.slice(0, 500)}`));
      });
      child.on("error", (err) => reject(err));
    });
  }
}
