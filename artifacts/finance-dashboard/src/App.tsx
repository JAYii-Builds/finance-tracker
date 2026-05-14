import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter, Link } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Dashboard from "@/pages/dashboard";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: `${window.location.origin}${basePath || "/"}`,
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#10b981",
    colorForeground: "#e5e5e5",
    colorMutedForeground: "#888888",
    colorDanger: "#ef4444",
    colorBackground: "#1a1a1a",
    colorInput: "#0f0f0f",
    colorInputForeground: "#e5e5e5",
    colorNeutral: "#444444",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "8px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "rounded-xl w-[440px] max-w-full overflow-hidden border border-[#2a2a2a]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#e5e5e5]",
    headerSubtitle: "text-[#888888]",
    socialButtonsBlockButtonText: "text-[#cccccc]",
    formFieldLabel: "text-[#aaaaaa]",
    footerActionLink: "text-[#10b981]",
    footerActionText: "text-[#888888]",
    dividerText: "text-[#555555]",
    identityPreviewEditButton: "text-[#10b981]",
    formFieldSuccessText: "text-[#10b981]",
    alertText: "text-[#e5e5e5]",
    logoBox: "mb-2",
    logoImage: "h-10 w-10 rounded-lg",
    socialButtonsBlockButton: "border border-[#2a2a2a] !bg-[#111] hover:!bg-[#1a1a1a]",
    formButtonPrimary: "!bg-[#10b981] hover:!bg-[#0e9f6e] text-white",
    formFieldInput: "!bg-[#0f0f0f] !border-[#2a2a2a] !text-[#e5e5e5]",
    footerAction: "!bg-[#111] border-t border-[#2a2a2a]",
    dividerLine: "!bg-[#2a2a2a]",
    alert: "!bg-[#111] border border-[#2a2a2a]",
    otpCodeFieldInput: "!bg-[#0f0f0f] !border-[#2a2a2a] !text-[#e5e5e5]",
    formFieldRow: "",
    main: "",
  },
};

function Landing() {
  return (
    <div style={{ background: "#0f0f0f", minHeight: "100dvh", color: "#e5e5e5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: "480px" }}>
        <div style={{ width: "60px", height: "60px", background: "#10b981", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: "22px", fontWeight: 700, color: "#fff" }}>
          FT
        </div>
        <h1 style={{ fontSize: "34px", fontWeight: 700, marginBottom: "12px", letterSpacing: "-0.5px" }}>Finance Tracker</h1>
        <p style={{ color: "#888", fontSize: "16px", lineHeight: 1.6, marginBottom: "36px" }}>
          Track your income and expenses in real time.<br />
          Your data is private — only you can see it.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/sign-in" style={{ background: "#10b981", color: "#fff", padding: "11px 28px", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" }}>
            Sign In
          </Link>
          <Link to="/sign-up" style={{ background: "#1a1a1a", color: "#e5e5e5", padding: "11px 28px", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px", border: "1px solid #2a2a2a" }}>
            Create Account
          </Link>
        </div>
        <p style={{ marginTop: "40px", color: "#444", fontSize: "12px" }}>
          Email + password · Google · GitHub
        </p>
        <div style={{ marginTop: "16px", display: "flex", gap: "16px", justifyContent: "center" }}>
          <Link to="/terms" style={{ color: "#555", fontSize: "12px", textDecoration: "none" }}>Terms of Service</Link>
          <Link to="/privacy" style={{ color: "#555", fontSize: "12px", textDecoration: "none" }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedDashboard() {
  return (
    <>
      <Show when="signed-in">
        <Dashboard />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkAuthTokenSetup() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(getToken);
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your Finance Tracker" } },
        signUp: { start: { title: "Create your account", subtitle: "Start tracking your finances privately" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenSetup />
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/dashboard" component={ProtectedDashboard} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
