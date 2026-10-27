import { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { LegalCallout } from "@/components/legal/LegalCallout";
import type { LegalTocItem } from "@/components/legal/LegalToc";

export const metadata: Metadata = {
  title: "Privacy Policy — Cortex",
  description: "How Cortex handles your data, in plain language.",
};

const TOC: LegalTocItem[] = [
  { id: "collect", number: "1", label: "What we collect" },
  { id: "use", number: "2", label: "How we use your data" },
  { id: "not-do", number: "3", label: "What we don't do" },
  { id: "processors", number: "4", label: "Third-party processors" },
  { id: "retention", number: "5", label: "Data retention" },
  { id: "rights", number: "6", label: "Your rights" },
  { id: "cookies", number: "7", label: "Cookies and consent" },
  { id: "ai", number: "8", label: "AI processing choices" },
  { id: "anonymous", number: "9", label: "Anonymous tickets" },
  { id: "security", number: "10", label: "Security" },
  { id: "children", number: "11", label: "Children" },
  { id: "changes", number: "12", label: "Changes to this policy" },
  { id: "contact", number: "13", label: "Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="This policy explains what information Cortex collects, how we use it, and the choices you have. We wrote it in plain language because we believe privacy policies should be readable."
      version="v0.4"
      lastUpdated="October 12, 2026"
      toc={TOC}
      seeAlso={[
        { href: "/terms", label: "Terms of Use" },
        { href: "/privacy/cookies", label: "Cookie Policy" },
        { href: "/features#privacy", label: "How consent works" },
      ]}
    >
      <h2 id="collect">1. What we collect</h2>

      <h3>Account information</h3>
      <p>
        Your email address, display name, and authentication identifiers are
        managed through Clerk, our authentication provider. We never see or
        store your password.
      </p>

      <h3>Content you create</h3>
      <p>
        Everything you capture, write, or generate in Cortex — thoughts, links,
        voice notes, images, videos, image annotations, files, decisions,
        reflections, goals, and chats — is stored in a PostgreSQL database and,
        for graph relationships, a Neo4j database. <strong>This content is
        yours.</strong>
      </p>

      <h3>Identity model</h3>
      <p>
        Cortex maintains a private profile of who you are: values, patterns,
        strengths, growth areas, and a short narrative. This is derived only
        from your own captures, decisions, and reflections. Every item in the
        model is evidence-cited — nothing is invented without support. The
        model is visible only to you and lives in your account.
      </p>

      <h3>Usage metadata</h3>
      <p>
        We log technical metadata such as request timestamps, error traces, and
        aggregate counts of features used. This is used to operate and debug
        the Service, not to profile you.
      </p>

      <h3>Consent record</h3>
      <p>
        When you make a privacy choice (e.g. turn off AI processing), we store
        the choice in a first-party cookie (<code>cortex_consent</code>) and in
        a database record. Consent changes are timestamped and IP-logged for
        audit purposes so that both you and we have a factual record of what
        was agreed and when.
      </p>

      <h2 id="use">2. How we use your data</h2>
      <ul>
        <li>
          <strong>To run the Service</strong> — storing your captures,
          generating summaries, answering your questions, and delivering
          notifications.
        </li>
        <li>
          <strong>To generate content through AI providers</strong> — when AI
          processing is enabled, your captures are sent to Groq and Google
          Gemini to extract concepts, classify captures, analyze images,
          generate embeddings, and answer questions. See{" "}
          <a href="#ai">§8</a> for what you can turn off.
        </li>
        <li>
          <strong>To improve reliability</strong> — detecting failures and
          fixing bugs.
        </li>
        <li>
          <strong>To improve our models</strong> — this is a reserved setting
          that is currently inactive. When the feature ships, it will be
          opt-in and off by default, and you will be able to withdraw consent
          at any time in Settings → Data.
        </li>
      </ul>

      <h2 id="not-do">3. What we do NOT do</h2>
      <ul>
        <li>We do not sell your personal data.</li>
        <li>We do not share your content with advertisers.</li>
        <li>
          We do not use your content to train third-party foundation models.
        </li>
        <li>
          We do <strong>not</strong> send your captures to any AI provider when
          AI processing is disabled. Captures stay on our servers and are
          stored as raw text.
        </li>
        <li>
          We do not read your captures or chats manually except when you
          explicitly ask us to via a support ticket.
        </li>
      </ul>

      <LegalCallout kind="promise" title="The AI processing guarantee">
        When AI processing is off, no content of yours reaches Groq or Google
        Gemini. It is not stored there, logged there, or used there. The switch
        is a hard gate, not a preference.
      </LegalCallout>

      <h2 id="processors">4. Third-party processors</h2>
      <p>
        Cortex relies on a small set of vetted service providers to operate.
        Each provider processes data only for the purpose of delivering the
        Service to you, and is bound by its own data protection terms.
      </p>

      <ul>
        <li>
          <strong>Clerk</strong> — authentication and session management.
        </li>
        <li>
          <strong>Groq</strong> — language model inference and audio
          transcription (Whisper).
        </li>
        <li>
          <strong>Google Gemini</strong> — embedding generation and image /
          video vision analysis.
        </li>
        <li>
          <strong>Supabase / Neon</strong> — PostgreSQL hosting.
        </li>
        <li>
          <strong>Neo4j Aura</strong> — graph database hosting.
        </li>
        <li>
          <strong>Resend / SMTP</strong> — transactional email delivery.
        </li>
        <li>
          <strong>Voyage AI</strong> — dormant embedding fallback (unused
          unless enabled).
        </li>
        <li>
          <strong>Webhooks you configure</strong> — outbound delivery to
          endpoints you control. You are responsible for the security of those
          endpoints.
        </li>
      </ul>

      <LegalCallout kind="info" title="Every provider above is optional">
        You can turn off AI processing entirely in{" "}
        <Link href="/features#privacy">Settings → Privacy</Link>. That gates all calls
        to Groq and Google Gemini for enrichment. Chat and search continue to
        work on a smaller scale, using only your existing graph.
      </LegalCallout>

      <h2 id="retention">5. Data retention</h2>
      <p>
        Your content is retained as long as your account exists. When you
        delete your account, we permanently remove your captures, decisions,
        reflections, goals, chats, and tickets from our production databases
        within 30 days. Backups are pruned on a rolling 30-day cycle.
      </p>

      <h2 id="rights">6. Your rights</h2>
      <p>At any time, you may:</p>
      <ul>
        <li>
          <strong>Export your data</strong> — download a complete JSON bundle
          of your captures, decisions, reflections, and goals from Settings →
          Data.
        </li>
        <li>
          <strong>Delete your data</strong> — remove chats or your entire
          account from Settings → Data.
        </li>
        <li>
          <strong>Withdraw consent</strong> — turn off AI processing, disable
          any cookie category, or reset your consent record at any time in
          Settings → Privacy. Withdrawal applies immediately to future
          processing.
        </li>
        <li>
          <strong>Object to processing</strong> — disable AI processing if you
          do not want your content sent to third-party providers. See{" "}
          <a href="#ai">§8</a>.
        </li>
        <li>
          <strong>Contact us</strong> — for any privacy question or request at{" "}
          <Link href="/contact">our contact page</Link> or{" "}
          <a href="mailto:cortexsupport@gmail.com">
            cortexsupport@gmail.com
          </a>
          .
        </li>
      </ul>

      <h2 id="cookies">7. Cookies and consent</h2>
      <p>
        Cortex uses a small number of cookies and equivalent mechanisms to
        function. They are grouped into five categories:
      </p>
      <ul>
        <li>
          <strong>Essential</strong> — login, session management, security,
          language preference, and the consent record itself. Always on.
        </li>
        <li>
          <strong>Personalization</strong> — long-term memory, cross-conversation
          recall, and the user model. Off by default.
        </li>
        <li>
          <strong>Performance</strong> — local caches and prefetching. Off by
          default.
        </li>
        <li>
          <strong>AI Processing</strong> — sending captures to Groq and Google
          Gemini for enrichment. Off by default.
        </li>
        <li>
          <strong>Marketing</strong> — reserved. No marketing communications
          are currently sent.
        </li>
      </ul>
      <p>
        The complete policy is at{" "}
        <Link href="/privacy/cookies">our Cookie Policy</Link>. You can change
        your choices at any time in Settings → Privacy, or from the &ldquo;Cookie
        preferences&rdquo; link in the footer of any public page.
      </p>

      <LegalCallout kind="tip" title="Two ways to change your mind">
        Reopen the preferences modal from{" "}
        <strong>Settings → Privacy</strong>, or from{" "}
        <strong>Cookie preferences</strong> in the footer. Your choice applies
        immediately and is stored both in a first-party cookie and in your
        account.
      </LegalCallout>

      <h2 id="ai">8. AI processing and your choices</h2>
      <p>
        Cortex uses AI to enrich your captures — extract concepts, classify
        captures by kind, analyze images, transcribe voice notes, generate
        embeddings, and answer questions. Everything below can be turned off
        with a single switch.
      </p>
      <p>
        When <strong>AI processing is ON</strong>, the following operations run
        (using Groq and Google Gemini):
      </p>
      <ul>
        <li>Concept extraction from captures</li>
        <li>Capture-kind classification (task, idea, question, reflection)</li>
        <li>Image analysis through Gemini Vision</li>
        <li>Video key-moment detection</li>
        <li>Embedding generation for search and recall</li>
        <li>User-model updates</li>
      </ul>
      <p>
        When <strong>AI processing is OFF</strong>:
      </p>
      <ul>
        <li>
          Captures save as raw text. No concepts are extracted, no
          classification runs, images are stored but not analyzed.
        </li>
        <li>
          Search falls back to keyword matching (existing embeddings still
          work).
        </li>
        <li>
          Chat and the agent framework remain available — they use only your
          existing graph, not new content.
        </li>
      </ul>
      <p>
        The technical implementation is described in the{" "}
        <Link href="/features#privacy">features reference</Link>.
      </p>

      <h2 id="anonymous">9. Anonymous support tickets</h2>
      <p>
        You can contact us without creating an account, from{" "}
        <Link href="/contact">our contact page</Link>. When you submit an
        anonymous ticket, we store:
      </p>
      <ul>
        <li>
          The <strong>message</strong> you wrote.
        </li>
        <li>
          The <strong>email address</strong> you provided (optional — if you
          leave it blank, the ticket is one-way).
        </li>
        <li>
          Your <strong>IP address</strong>, used only for rate limiting. It is
          not used to identify you.
        </li>
        <li>
          A <strong>timestamp</strong> and a small amount of context to help us
          debug the report.
        </li>
      </ul>
      <p>
        Anonymous tickets are subject to the same retention policy as regular
        tickets. To have an anonymous ticket deleted, reply to our response
        email and ask, or submit a new ticket referencing the original.
      </p>

      <h2 id="security">10. Security</h2>
      <p>
        All traffic between your browser and our servers is encrypted in
        transit. Data at rest is encrypted by our database providers. Access to
        production systems is restricted and audited. If you discover a
        security issue, please report it responsibly through{" "}
        <Link href="/contact">our contact page</Link> or{" "}
        <a href="mailto:cortexsupport@gmail.com">
          cortexsupport@gmail.com
        </a>
        .
      </p>

      <h2 id="children">11. Children</h2>
      <p>
        Cortex is not intended for users under 16. We do not knowingly collect
        personal information from children.
      </p>

      <h2 id="changes">12. Changes to this policy</h2>
      <p>
        If we make material changes, we will notify you by email or in-app
        before they take effect. The &ldquo;Last updated&rdquo; date and version number at
        the top of this page always reflect the current version. Every change
        to this policy is recorded in the{" "}
        <Link href="/changelog">changelog</Link>.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        Cortex is operated by an independent developer. Questions, requests,
        or complaints: <Link href="/contact">our contact page</Link> or{" "}
        <a href="mailto:cortexsupport@gmail.com">
          cortexsupport@gmail.com
        </a>
        .
      </p>
    </LegalLayout>
  );
}
