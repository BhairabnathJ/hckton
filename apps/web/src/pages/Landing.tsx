import { Link } from "react-router-dom";
import { Logo } from "../components/AppShell";
import { Card, LinkButton } from "../components/ui";
import { useDemoUser } from "../lib/demoUser";
import { isCompany } from "../lib/format";

const steps = [
  { n: "1", title: "Pick a ticket", body: "Real bugs in a simulated company codebase, starting at Level 1." },
  { n: "2", title: "Open a PR", body: "Hidden tests grade it in a sandbox, then an AI reviewer leaves comments." },
  { n: "3", title: "Level up", body: "Passing tickets earns XP. Hints and extra review rounds cost bonus XP." },
  { n: "4", title: "Get paid", body: "At Level 6, claim paid jobs from real companies. First qualified claim wins." },
];

export function Landing() {
  const company = isCompany(useDemoUser().me);
  return (
    <div className="min-h-screen bg-[radial-gradient(1100px_620px_at_50%_-10%,#dbe8ff,transparent_70%)]">
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
        <Logo />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-control px-3 py-2 text-ink-2 no-underline hover:bg-surface sm:inline">
            How it works
          </a>
          {company && (
            <Link to="/company" className="hidden rounded-control px-3 py-2 text-ink-2 no-underline hover:bg-surface sm:inline">
              Company dashboard
            </Link>
          )}
          <LinkButton to="/login" size="sm">
            Log in
          </LinkButton>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-xp-line bg-surface px-3 py-1 text-[12.5px] font-semibold text-xp-text">
          For CS students
        </span>
        <h1 className="m-0 mt-5 text-4xl leading-[1.05] font-bold tracking-[-0.04em] sm:text-6xl">
          Real codebases. Real reviews. <span className="text-cash">Real pay.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-ink-2 sm:text-lg">
          Level up on simulated engineering tickets graded by hidden tests and AI review. Reach Level 6 and the paid job board
          unlocks.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton to="/login" size="lg">
            Start at Level 1
          </LinkButton>
          {company && (
            <LinkButton to="/company" variant="secondary" size="lg">
              Post a paid job
            </LinkButton>
          )}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <h2 className="m-0 mb-6 text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <Card key={s.n} className="p-5">
              <span className="grid size-8 place-items-center rounded-lg bg-xp-soft font-mono text-sm font-bold text-xp-text">{s.n}</span>
              <h3 className="m-0 mt-3 text-[16px] font-semibold">{s.title}</h3>
              <p className="m-0 mt-1.5 text-[13.5px] text-ink-2">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
