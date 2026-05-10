import { Glasses, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";

type AuthPanelProps = {
  error: string | null;
  loading: boolean;
  onLogin: (password: string) => Promise<void>;
};

export function AuthPanel({ error, loading, onLogin }: AuthPanelProps) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(password);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="Vishal.ai login">
        <div className="auth-mark" aria-hidden="true">
          <Glasses size={28} />
        </div>
        <div className="auth-copy">
          <span>Private workspace</span>
          <h1>Vishal.ai</h1>
          <p>Enter the password to open the vault console.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          {error ? <p>{error}</p> : null}
          <button disabled={loading || !password} type="submit">
            <LockKeyhole size={15} />
            Unlock
          </button>
        </form>
      </section>
    </main>
  );
}
