import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Lock,
  Mail,
  User,
  MapPin,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Check,
  ArrowRight,
  Sparkles,
  KeyRound,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ALL_47_COUNTIES, getConstituenciesByCounty } from '../data/kenyaCounties';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin'
}) => {
  const {
    loginWithGoogle,
    registerWithEmailPassword,
    loginWithEmailPassword,
    resetPassword
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'register' | 'forgot'>(initialMode);

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [county, setCounty] = useState('Nairobi');
  const [constituency, setConstituency] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync mode with prop change
  useEffect(() => {
    setMode(initialMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [initialMode, isOpen]);

  // Handle ESC key to close modal reliably
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Real-time Password Security Criteria Validation
  const passwordSecurity = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    const score = [hasMinLength, hasUpperCase, hasLowerCase, hasNumberOrSymbol].filter(Boolean).length;
    const isSecure = hasMinLength && hasUpperCase && hasLowerCase && hasNumberOrSymbol;

    return {
      hasMinLength,
      hasUpperCase,
      hasLowerCase,
      hasNumberOrSymbol,
      score,
      isSecure
    };
  }, [password]);

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // Available constituencies for selected county
  const availableConstituencies = useMemo(() => {
    return getConstituenciesByCounty(county);
  }, [county]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (mode === 'register') {
      if (!displayName.trim()) {
        setErrorMessage('Please enter your full name or nickname.');
        return;
      }
      if (!passwordSecurity.isSecure) {
        setErrorMessage('Password does not meet the security requirements.');
        return;
      }
      if (!passwordsMatch) {
        setErrorMessage('Passwords do not match. Please verify your password confirmation.');
        return;
      }

      setIsSubmitting(true);
      try {
        await registerWithEmailPassword(
          email,
          password,
          displayName,
          county,
          constituency || undefined
        );
        onClose();
      } catch (err: any) {
        console.error('Registration error:', err);
        if (err?.code === 'auth/email-already-in-use') {
          setErrorMessage('This email is already registered. Please sign in instead.');
        } else if (err?.code === 'auth/invalid-email') {
          setErrorMessage('Please enter a valid email address.');
        } else if (err?.code === 'auth/weak-password') {
          setErrorMessage('Password is too weak. Please use a stronger password.');
        } else {
          setErrorMessage(err?.message || 'Failed to create citizen account. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    } else if (mode === 'signin') {
      setIsSubmitting(true);
      try {
        await loginWithEmailPassword(email, password);
        onClose();
      } catch (err: any) {
        console.error('Sign-in error:', err);
        if (
          err?.code === 'auth/wrong-password' ||
          err?.code === 'auth/user-not-found' ||
          err?.code === 'auth/invalid-credential'
        ) {
          setErrorMessage('Invalid email or password. Please verify and try again.');
        } else if (err?.code === 'auth/invalid-email') {
          setErrorMessage('Please enter a valid email address.');
        } else {
          setErrorMessage(err?.message || 'Sign in failed. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    } else if (mode === 'forgot') {
      if (!email.trim()) {
        setErrorMessage('Please enter your email to receive a password reset link.');
        return;
      }
      setIsSubmitting(true);
      try {
        await resetPassword(email);
        setSuccessMessage('Password reset email sent! Please check your inbox and follow the link.');
      } catch (err: any) {
        console.error('Password reset error:', err);
        setErrorMessage(err?.message || 'Could not send reset email. Please verify your email address.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err?.message || 'Google authentication failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-6 relative flex flex-col max-h-[92vh] animate-in zoom-in-95 transition-colors"
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-5 sm:p-6 relative">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>TUJUANE Citizen Security</span>
              </div>
              <h2 id="auth-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {mode === 'register'
                  ? 'Join TUJUANE Kenya'
                  : mode === 'signin'
                  ? 'Welcome Back, Citizen'
                  : 'Reset Citizen Password'}
              </h2>
              <p className="text-xs text-slate-300">
                {mode === 'register'
                  ? 'Create your citizen account with secure password protection.'
                  : mode === 'signin'
                  ? 'Sign in to access discussions, chats, polls, and local hustles.'
                  : 'Enter your email to receive a password reset link.'}
              </p>
            </div>

            {/* Top Close (X) Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer shrink-0"
              title="Close dialog (Esc)"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switch Tabs */}
          {mode !== 'forgot' && (
            <div className="flex rounded-xl bg-white/10 p-1 mt-4 text-xs font-bold border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Register Account
              </button>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-white dark:bg-slate-900">
          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Success Message Alert */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Name (Only in Registration Mode) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Full Name or Community Handle *</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Wangari Maathai or Nairobi Hustler"
                    maxLength={60}
                    className="w-full pl-9.5 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    required
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9.5 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  required
                />
              </div>
            </div>

            {/* Password Field (Sign In and Registration) */}
            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {mode === 'register' ? 'Secure Password *' : 'Password *'}
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Create a strong, secure password' : 'Enter your password'}
                    className="w-full pl-9.5 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-3 top-2.5 cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Security Criteria (Registration Mode Only) */}
                {mode === 'register' && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                    {/* Visual Strength Meter */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                          <span>Password Security Strength:</span>
                        </span>
                        <span
                          className={`font-black uppercase tracking-wider ${
                            passwordSecurity.score === 4
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : passwordSecurity.score >= 3
                              ? 'text-blue-600 dark:text-blue-400'
                              : passwordSecurity.score >= 2
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {passwordSecurity.score === 4
                            ? 'Strong ✓'
                            : passwordSecurity.score === 3
                            ? 'Good'
                            : passwordSecurity.score === 2
                            ? 'Fair'
                            : password.length > 0
                            ? 'Weak'
                            : 'Required'}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 h-1.5">
                        <div
                          className={`rounded-full transition-all ${
                            passwordSecurity.score >= 1 ? 'bg-rose-500' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                        <div
                          className={`rounded-full transition-all ${
                            passwordSecurity.score >= 2 ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                        <div
                          className={`rounded-full transition-all ${
                            passwordSecurity.score >= 3 ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                        <div
                          className={`rounded-full transition-all ${
                            passwordSecurity.score >= 4 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Checkmarks checklist */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div
                        className={`flex items-center gap-1.5 font-medium ${
                          passwordSecurity.hasMinLength ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Check
                          className={`w-3.5 h-3.5 ${
                            passwordSecurity.hasMinLength ? 'text-emerald-600 stroke-[3]' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                        <span>At least 8 characters</span>
                      </div>

                      <div
                        className={`flex items-center gap-1.5 font-medium ${
                          passwordSecurity.hasUpperCase ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Check
                          className={`w-3.5 h-3.5 ${
                            passwordSecurity.hasUpperCase ? 'text-emerald-600 stroke-[3]' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                        <span>Uppercase letter (A-Z)</span>
                      </div>

                      <div
                        className={`flex items-center gap-1.5 font-medium ${
                          passwordSecurity.hasLowerCase ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Check
                          className={`w-3.5 h-3.5 ${
                            passwordSecurity.hasLowerCase ? 'text-emerald-600 stroke-[3]' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                        <span>Lowercase letter (a-z)</span>
                      </div>

                      <div
                        className={`flex items-center gap-1.5 font-medium ${
                          passwordSecurity.hasNumberOrSymbol ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Check
                          className={`w-3.5 h-3.5 ${
                            passwordSecurity.hasNumberOrSymbol ? 'text-emerald-600 stroke-[3]' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                        <span>Number or symbol</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Confirm Password Field (Registration Mode Only) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Confirm Password *
                  </label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`text-[11px] font-bold ${
                        passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {passwordsMatch ? 'Passwords match ✓' : 'Does not match'}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your secure password"
                    className={`w-full pl-9.5 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      confirmPassword.length > 0 && !passwordsMatch
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-300 dark:border-slate-700 focus:ring-emerald-500'
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-3 top-2.5 cursor-pointer"
                    title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* County and Constituency (Registration Mode Only) */}
            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>Home County *</span>
                  </label>
                  <select
                    value={county}
                    onChange={(e) => {
                      setCounty(e.target.value);
                      setConstituency('');
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium"
                  >
                    {ALL_47_COUNTIES.map((c) => (
                      <option key={c} value={c}>
                        {c} County
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Constituency (Optional)
                  </label>
                  <select
                    value={constituency}
                    onChange={(e) => setConstituency(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 cursor-pointer font-medium"
                  >
                    <option value="">Select Constituency</option>
                    {availableConstituencies.map((con) => (
                      <option key={con} value={con}>
                        {con}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                (mode === 'register' && (!passwordSecurity.isSecure || !passwordsMatch))
              }
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : mode === 'register' ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-200" />
                  <span>Register Secure Citizen Account</span>
                </>
              ) : mode === 'signin' ? (
                <>
                  <ArrowRight className="w-4 h-4 text-emerald-200" />
                  <span>Sign In</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 text-emerald-200" />
                  <span>Send Reset Link</span>
                </>
              )}
            </button>
          </form>

          {/* Social Alternative: One-click Google sign in */}
          {mode !== 'forgot' && (
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="relative flex items-center justify-center">
                <span className="absolute inset-x-0 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="relative bg-white dark:bg-slate-900 px-3 text-[11px] font-semibold text-slate-400 uppercase">
                  Or continue with
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Google Account</span>
              </button>
            </div>
          )}

          {/* Back to sign in if in forgot password mode */}
          {mode === 'forgot' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer with Explicit Functional Close Button */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400 text-[11px]">
            Protected by TUJUANE Security
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
            title="Close dialog"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
