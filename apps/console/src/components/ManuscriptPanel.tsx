export function ManuscriptPanel() {
  return (
    <section className="manuscript-panel" id="manuscript" aria-label="Active note">
      <div className="folio-bar">
        <span>Active folio</span>
        <strong>Bridge Notes</strong>
      </div>
      <article className="folio-page">
        <p className="folio-kicker">Working surface</p>
        <h3>Distributed Systems Synthesis</h3>
        <p>
          Obsidian remains the capture layer. The server keeps a real Markdown mirror of the vault, and the
          terminal opens directly in that folder so any coding agent can read, write, compare, and compose.
        </p>
        <div className="folio-metrics">
          <div>
            <span>Source strata</span>
            <strong>class notes, scans, daily fragments</strong>
          </div>
          <div>
            <span>Output shelf</span>
            <strong>summaries/ and bridge-notes/</strong>
          </div>
        </div>
      </article>
    </section>
  );
}
