import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "./api";
import "./Auth.css";

function AuthScreen({ onAuthenticated }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isRegister = location.pathname === "/register";
  const [step, setStep] = useState("credentials");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestCode = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = isRegister
        ? "/auth/register/request-otp"
        : "/auth/login/request-otp";
      const payload = isRegister
        ? { name, email, password }
        : { email, password };
      const response = await api.post(path, payload);
      setNotice(response.data.message);
      setStep("code");
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not send your verification code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = isRegister ? "/auth/register/verify" : "/auth/login/verify";
      const response = await api.post(path, { email, code });
      onAuthenticated(response.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "That code could not be verified. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const changeMode = () => {
    setStep("credentials");
    setCode("");
    setError("");
    setNotice("");
    navigate(isRegister ? "/login" : "/register");
  };

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="auth-brand-icon">✳</span>
        <span>meetify</span>
      </div>
      <section className="auth-card">
        <div className="auth-mark">
          <span>✳</span>
        </div>
        <p className="auth-eyebrow">
          {step === "code" ? "ONE LAST STEP" : "A LITTLE CLOSER"}
        </p>
        <h1>
          {step === "code"
            ? "Check your inbox."
            : isRegister
              ? "Make room for good things."
              : "Welcome back."}
        </h1>
        <p className="auth-intro">
          {step === "code"
            ? `We sent a 6-digit sign-in code to ${email}. It expires in 10 minutes.`
            : isRegister
              ? "Create your account and bring your conversations together."
              : "Sign in to pick up where your conversations left off."}
        </p>

        {error && (
          <div className="auth-alert" role="alert">
            {error}
          </div>
        )}
        {notice && step === "code" && (
          <div className="auth-notice" role="status">
            {notice}
          </div>
        )}

        {step === "credentials" ? (
          <form className="auth-form" onSubmit={requestCode}>
            {isRegister && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alex Morgan"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  isRegister ? "At least 8 characters" : "Your password"
                }
                minLength={isRegister ? 8 : undefined}
                required
              />
            </label>
            <button className="auth-submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Continue with email"}
              <span>→</span>
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verifyCode}>
            <label>
              6-digit verification code
              <input
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                required
              />
            </label>
            <button
              className="auth-submit"
              disabled={busy || code.length !== 6}
            >
              {busy ? "Verifying…" : "Verify and sign in"}
              <span>→</span>
            </button>
            <button
              className="auth-back"
              type="button"
              onClick={() => {
                setStep("credentials");
                setCode("");
                setError("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "New to Meetify?"}{" "}
          <Link to={isRegister ? "/login" : "/register"} onClick={changeMode}>
            {isRegister ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
      <p className="auth-footer">
        <span>♢</span> Your conversations are yours. Always.
      </p>
    </main>
  );
}

export default AuthScreen;
