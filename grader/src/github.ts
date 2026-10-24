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
