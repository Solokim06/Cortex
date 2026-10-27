import { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { LegalCallout } from "@/components/legal/LegalCallout";
import type { LegalTocItem } from "@/components/legal/LegalToc";

export const metadata: Metadata = {
  title: "Terms of Use — Cortex",
  description: "The terms governing your use of Cortex.",
};

const TOC: LegalTocItem[] = [
  { id: "eligibility", number: "1", label: "Eligibility" },
  { id: "account", number: "2", label: "Your account" },
  { id: "content", number: "3", label: "Your content" },
  { id: "use", number: "4", label: "Acceptable use" },
  { id: "third-party", number: "5", label: "Third-party services" },
  { id: "availability", number: "6", label: "Availability" },
  { id: "termination", number: "7", label: "Termination" },
  { id: "disclaimers", number: "8", label: "Disclaimers" },
  { id: "liability", number: "9", label: "Limitation of liability" },
  { id: "changes", number: "10", label: "Changes to these Terms" },
  { id: "contact", number: "11", label: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      subtitle="These terms govern your access to and use of the Cortex application, website, browser extension, and related services."
      version="v0.4"
      lastUpdated="October 12, 2026"
      toc={TOC}
      seeAlso={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/privacy/cookies", label: "Cookie Policy" },
        { href: "/changelog", label: "Changelog" },
      ]}
    >
      <p>
        Welcome to Cortex. These Terms of Use (&ldquo;Terms&rdquo;) govern your
        access to and use of the Cortex application, website, browser extension,
        and related services (collectively, the &ldquo;Service&rdquo;). By
        creating an account or using the Service, you agree to be bound by
        these Terms.
      </p>

      <h2 id="eligibility">1. Eligibility</h2>
      <p>
        You must be at least 16 years old to use Cortex. If you are using the
        Service on behalf of an organization, you represent that you have
        authority to bind that organization to these Terms.
      </p>

      <h2 id="account">2. Your account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your
        credentials and for all activity that occurs under your account. Notify
        us promptly through{" "}
        <Link href="/contact">our contact page</Link> if you suspect
        unauthorized access.
      </p>

      <h2 id="content">3. Your content</h2>
      <p>
        You retain all rights to the content you capture, upload, or generate
        through the Service (&ldquo;Your Content&rdquo;). You grant Cortex a
        limited, worldwide, non-exclusive license to host, store, and process
        Your Content solely to operate and improve the Service for you.
      </p>

      <h3>Data contribution setting</h3>
      <p>
        Cortex includes a data contribution setting accessible at{" "}
        <strong>Settings → Data</strong>. When enabled, in the future it will
        grant us a license to use anonymized, aggregated representations of
        Your Content to improve our models. <strong>This feature is currently
        reserved and inactive</strong> — no such processing occurs today. You
        can toggle the setting at any time; the change is logged for audit.
      </p>

      <h3>AI processing</h3>
      <p>
        When AI processing is enabled, Your Content is sent to Groq and Google
        Gemini to enrich your captures (see{" "}
        <Link href="/privacy#ai">Privacy Policy §8</Link> for the full list of
        operations). You can disable AI processing at any time in{" "}
        <strong>Settings → Privacy</strong>. When disabled, your captures are
        not sent to any AI provider.
      </p>

      <h2 id="use">4. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Violate any applicable law or regulation;</li>
        <li>Infringe the intellectual property or privacy rights of others;</li>
        <li>
          Upload malware, spam, or content that is unlawful or harmful;
        </li>
        <li>
          Attempt to reverse-engineer, scrape, or overload the Service —
          including abusive use of the anonymous contact form;
        </li>
        <li>
          Impersonate another person or misrepresent your affiliation.
        </li>
      </ul>
      <p>
        Automated submissions to our{" "}
        <Link href="/contact">contact form</Link> are rate-limited to five
        messages per hour per IP address. Circumventing this limit through
        proxies, rotation, or automated means is a violation of these Terms.
      </p>

      <h2 id="third-party">5. Third-party services</h2>
      <p>
        Cortex relies on third-party providers for authentication, model
        inference, embeddings, database hosting, and email delivery. Your use
        of those features is subject to their respective terms. The full list
        of providers and what they do is documented in our{" "}
        <Link href="/privacy#processors">Privacy Policy §4</Link>.
      </p>

      <h2 id="availability">6. Availability</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted
        service. We may modify, suspend, or discontinue features with
        reasonable notice. We will not remove a feature you actively rely on
        without providing a data export path first.
      </p>

      <h2 id="termination">7. Termination</h2>
      <p>
        You may delete your account at any time from{" "}
        <strong>Settings → Data</strong>. We may suspend or terminate accounts
        that violate these Terms. Upon termination, your right to use the
        Service ends immediately, and your content is deleted according to the
        retention policy in our{" "}
        <Link href="/privacy#retention">Privacy Policy §5</Link>.
      </p>

      <h2 id="disclaimers">8. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any
        kind, express or implied. Cortex does not warrant that outputs
        generated by AI models are accurate, complete, or suitable for any
        particular purpose.
      </p>

      <LegalCallout kind="warning" title="AI outputs may be wrong">
        Cortex uses language and vision models to extract concepts, classify
        captures, and answer questions. These outputs can be inaccurate or
        incomplete, especially for niche, ambiguous, or adversarial input.
        Do not rely on Cortex for legal, medical, financial, or safety-critical
        decisions without independent verification.
      </LegalCallout>

      <h2 id="liability">9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Cortex and its operators shall
        not be liable for any indirect, incidental, special, consequential, or
        punitive damages arising out of or related to your use of the Service.
      </p>

      <h2 id="changes">10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        announced in-app or by email. Continued use after the effective date
        constitutes acceptance of the revised Terms. Every change to these
        Terms is recorded in the <Link href="/changelog">changelog</Link>.
      </p>

      <h2 id="contact">11. Contact</h2>
      <p>
        Questions about these Terms? Reach us through{" "}
        <Link href="/contact">our contact page</Link> or by email at{" "}
        <a href="mailto:cortexsupport@gmail.com">
          cortexsupport@gmail.com
        </a>
        .
      </p>
    </LegalLayout>
  );
}
