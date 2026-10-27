import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy — Cortex",
  description:
    "How Cortex uses cookies, what each category does, and how to change your preferences.",
};

export default function CookiePolicyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16 prose prose-invert prose-sm sm:prose-base prose-headings:text-foreground prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground prose-a:text-primary">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight not-prose mb-2">
        Cookie Policy
      </h1>
      <p className="text-xs text-muted-foreground not-prose mb-10">
        Last updated: October 10, 2026
      </p>

      <p>
        This page explains how Cortex uses cookies and local storage, what each
        category does, and how you can change your preferences at any time.
        It complements our{" "}
        <Link href="/privacy">Privacy Policy</Link>, which describes how we
        handle your data more broadly.
      </p>

      <h2>What is a cookie?</h2>
      <p>
        A cookie is a small piece of data your browser stores on behalf of a
        website. Cortex uses cookies for two purposes: to remember that you
        are signed in, and to remember your preferences — including your
        consent choices on this page.
      </p>

      <p>
        Cortex also uses <strong>local storage</strong>, a similar mechanism
        with a longer lifetime and larger capacity. For the purposes of this
        policy, both are treated the same way.
      </p>

      <h2>Categories</h2>

      <h3>1. Essential</h3>
      <p>
        <strong>Always active. Cannot be disabled.</strong>
      </p>
      <p>
        These are required for Cortex to function at all. They include:
      </p>
      <ul>
        <li>
          <strong>Session cookie</strong> — issued by Clerk, our
          authentication provider, to keep you signed in.
        </li>
        <li>
          <strong>CSRF token</strong> — protects state-changing requests.
        </li>
        <li>
          <strong>Locale preference</strong> (<code>NEXT_LOCALE</code>) —
          remembers your chosen language.
        </li>
        <li>
          <strong>Consent record</strong> (<code>cortex_consent</code>) —
          stores the choices you make on this page so we don&apos;t ask every
          visit.
        </li>
      </ul>

      <h3>2. Personalization</h3>
      <p>
        <strong>Optional. On by default only after you opt in.</strong>
      </p>
      <p>
        Personalization enables Cortex&apos;s long-term memory features:
      </p>
      <ul>
        <li>
          <strong>Rolling summaries</strong> — condensed versions of long
          conversations so past context is available without re-reading
          everything.
        </li>
        <li>
          <strong>Cross-conversation recall</strong> — surfacing relevant
          earlier captures when you ask a question now.
        </li>
        <li>
          <strong>User model</strong> — a persistent profile derived from your
          captures and chats, used to tailor responses.
        </li>
      </ul>
      <p>
        If Personalization is disabled, Cortex runs <em>stateless</em>:
        captures still save and search still works, but the assistant has no
        memory beyond the current conversation.
      </p>

      <h3>3. Performance</h3>
      <p>
        <strong>Optional.</strong>
      </p>
      <p>
        These are local optimizations that speed up the app:
      </p>
      <ul>
        <li>
          <strong>Cache</strong> — recent results, embeddings, and UI data
          stored locally so repeat visits are fast.
        </li>
        <li>
          <strong>Prefetching</strong> — fetching likely-next pages or data
          ahead of time.
        </li>
      </ul>
      <p>
        If Performance is disabled, everything still works — some operations
        are just slower.
      </p>

      <h3>4. AI processing</h3>
      <p>
        <strong>Optional. Required for Cortex&apos;s core intelligence.</strong>
      </p>
      <p>
        When you capture a thought, file, image, or voice note, Cortex can
        send the content to third-party AI providers for processing:
      </p>
      <ul>
        <li>
          <strong>Groq</strong> — language model inference for concept
          extraction, summarization, and the chat assistant.
        </li>
        <li>
          <strong>Google Gemini</strong> — vision analysis for images and
          embedding generation for semantic search.
        </li>
      </ul>
      <p>
        Content sent to these providers is subject to their respective data
        protection terms; neither is used to train third-party foundation
        models per their public commitments. For more detail, see Section 4
        of our <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        If AI processing is disabled, captures save as <em>raw text only</em>:
        no concepts are extracted, no classification runs, images are stored
        but not analyzed, and search falls back to keyword matching. This
        makes Cortex effectively a plain notebook.
      </p>

      <h3>5. Marketing</h3>
      <p>
        <strong>Reserved for future use. Currently inactive.</strong>
      </p>
      <p>
        This category is a placeholder for future product update emails and
        newsletters. Cortex does not currently send marketing communications
        and does not sell or share user data with advertisers.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the GDPR, CCPA, and similar regulations, you have the right to:
      </p>
      <ul>
        <li>
          <strong>Access</strong> — see what categories you have enabled at
          any time in <em>Settings → Privacy</em>.
        </li>
        <li>
          <strong>Withdraw consent</strong> — turn off any optional category
          with immediate effect for future processing.
        </li>
        <li>
          <strong>Object to processing</strong> — disable AI processing if
          you do not want your content sent to third-party providers.
        </li>
        <li>
          <strong>Data portability</strong> — export a full JSON copy of your
          data from <em>Settings → Data</em>.
        </li>
        <li>
          <strong>Erasure</strong> — delete your account and all associated
          data from <em>Settings → Data</em>.
        </li>
      </ul>
      <p>
        Cortex does not sell personal information. We do not run advertising
        cookies or cross-site tracking scripts.
      </p>

      <h2>Changing your preferences</h2>
      <p>
        You can change your cookie preferences at any time:
      </p>
      <ul>
        <li>
          Open <strong>Settings → Privacy</strong> in the app, click{" "}
          <em>Manage preferences</em>, and adjust the toggles.
        </li>
        <li>
          Or click <em>Manage</em> on the cookie banner that appears on your
          first visit.
        </li>
      </ul>
      <p>
        Your choice is stored in a first-party cookie (
        <code>cortex_consent</code>) and in your browser&apos;s local storage.
        If you clear these, the banner will appear again and you will be
        asked to choose.
      </p>

      <h2>Retention</h2>
      <p>
        The consent cookie is retained for <strong>one year</strong>, or
        until you reset your preferences. Session cookies expire when you
        sign out or close the browser.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy?{" "}
        <a href="mailto:cortexsupport@gmail.com">
          cortexsupport@gmail.com
        </a>
      </p>

      <hr />
      <p className="text-xs text-muted-foreground">
        This document is provided for transparency and is not legal advice.
        Consult a qualified professional for compliance with specific
        jurisdictions.
      </p>
    </article>
  );
}
