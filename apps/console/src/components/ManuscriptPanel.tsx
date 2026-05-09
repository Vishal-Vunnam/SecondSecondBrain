export function ManuscriptPanel() {
  return (
    <section className="manuscript-panel" id="manuscript" aria-label="Active note">
      <div className="folio-bar">
        <strong>Active note</strong>
      </div>
      <article className="folio-page">
        <h3>Distributed Systems Synthesis</h3>
        <p>
          Obsidian captures. The server mirrors the vault as Markdown. The terminal opens in that folder so any agent
          can read, write, and compose.
        </p>
        <div className="folio-metrics">
          <div>
            <span>Sources</span>
            <strong>class notes, scans, daily fragments</strong>
          </div>
          <div>
            <span>Outputs</span>
            <strong>summaries/, bridge-notes/</strong>
          </div>
        </div>
      </article>
    </section>
  );
}
