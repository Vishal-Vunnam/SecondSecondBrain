import { BookOpenText, GalleryVerticalEnd, Terminal } from "lucide-react";

export function Rail() {
  return (
    <aside className="rail" aria-label="Workspace rail">
      <div className="sigil">SB</div>
      <nav className="rail-nav">
        <a className="rail-button active" href="#manuscript" aria-label="Manuscript">
          <BookOpenText size={18} />
        </a>
        <a className="rail-button" href="#terminal" aria-label="Terminal">
          <Terminal size={18} />
        </a>
        <a className="rail-button" href="#ledger" aria-label="Ledger">
          <GalleryVerticalEnd size={18} />
        </a>
      </nav>
    </aside>
  );
}
