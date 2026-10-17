const STEPS = [
  {
    title: "Signals",
    body: "Every profile keeps its own record: what you finish, what you abandon early, the stars you give, what you add to My List, and the genres you picked when you joined.",
  },
  {
    title: "Candidates",
    body: "From those signals we gather titles worth considering — more from genres you favour, from actors and directors you keep coming back to, titles people with similar taste enjoyed, and what's being watched on Reelhouse right now.",
  },
  {
    title: "Ranking",
    body: "Each candidate gets a fit score for you. Anything you've already finished, or that's above the profile's maturity setting, is filtered out before anything reaches your screen.",
  },
  {
    title: "Rows with reasons",
    body: "Your home is assembled into rows, and each one says why it exists — “Because you liked Arrival”, “You picked Thriller during setup”. Rate a title and the next visit reflects it.",
  },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="border-t px-4 py-20 sm:px-8 sm:py-28 lg:px-12">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">How recommendations work</p>
          <h2
            id="how-it-works"
            className="font-display text-4xl font-bold uppercase leading-none tracking-wide text-balance sm:text-5xl"
          >
            Four steps from what you watch to what you see
          </h2>
          <p className="max-w-md text-pretty text-muted-foreground">
            The same pipeline runs for every profile, every time you open your home. Nothing is promoted because someone
            paid for the slot.
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 bg-background p-6 sm:p-8">
              <span className="font-mono text-sm tabular-nums text-primary">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
