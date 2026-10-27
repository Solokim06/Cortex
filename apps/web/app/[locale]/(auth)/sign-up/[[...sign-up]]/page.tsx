import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        fallbackRedirectUrl="/home"
        signInFallbackRedirectUrl="/home"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-card border border-border shadow-none",
          },
        }}
      />
    </div>
  );
}
