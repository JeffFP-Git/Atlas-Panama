# Atlas Panama — Q&A Draft (English)

*Draft for review — now filled in with your answers. Reorder further as needed; this is a working draft, not final placement.*

## Why We Built This

**1. What kinds of things actually happen that make this service necessary?**
A few real examples the platform's developers have personally seen — and a large part of why we built this service and priced it so accessibly:

- **A power of attorney gets recorded on a corporate entity.** Shortly after, the person holding it takes out a loan against the property and never pays it back — the owner finds out months later when a foreclosure process (*proceso ejecutivo inmobiliario*) has already started.
- **A property goes unwatched for years, and someone completes adverse possession (squatting).** After enough time, it becomes extremely difficult to remove them. Catching it early, when it starts, usually means you can still stop it. *(This isn't legal advice — talk to an attorney.)*
- **Inheritance disputes.** An heir takes preemptive action on a property or entity, creating anger, frustration, and confusion among the other heirs. This service tells you as it's happening — not months or years later, when it may be too late to do anything about it.
- **A lien gets placed on your property for an unpaid bill — real or not — and you're never notified,** so you never get the chance to defend yourself against it. After enough time passes, this too becomes very hard or impossible to remove.

## About the Service

**2. What is Atlas Panama?**
Atlas Panama monitors Panama's Registro Público (Public Registry) for changes to properties and legal entities you register with us, and alerts you the moment something changes — so you find out from us, not years later when it's too late to act.

**3. What can I monitor — just property, or businesses too?**
Both. You can register a property (finca/folio), a Mercantil entity (S.A., Corp, Inc., or S.R.L.), or a Fundación de Interés Privado (private interest foundation).

**4. How often do you actually check the Registro Público?**
Every single day, for every property and entity registered on the platform — regardless of how often we email you about it.

**5. If you check daily, why don't I get an email every day?**
To keep your inbox manageable. Routine "nothing changed" updates are sent weekly by default. If something actually changes, we email you immediately, the same day we find it — real alerts never wait for the weekly schedule.

**6. What exactly counts as a "change" you'd alert me about?**
Anything different across the full record — not just the Prelación (pending registration) tab, but every relevant section, including Miembros Relacionados (board members/officers) and Apoderados (powers of attorney). We check the whole record, not a narrow slice of it.

**7. Why does a Power of Attorney (Apoderado) change matter so much?**
A new or modified power of attorney can let someone act legally on behalf of your property or company — including, in the worst case, without your knowledge or authorization. It's one of the most consequential changes we watch for.

**8. Where do changes to my property or entity actually come from?**
Changes are made through the Prelación process — a document is submitted (a deed of sale, a court order, a change in the board, a declaration of improvements, a power of attorney, and more), and the Registro Público reviews it: they either reject it, request corrections, or approve it. Once approved, it updates your official record — which is exactly the moment we catch it.

**9. Will you attach a full PDF report every time?**
If you have 1-2 properties/entities registered, yes, every check. If you have 3 or more, we only attach the full PDF when something actually changed or on your very first check — routine "no change" updates just show a quick status line for each, to keep the email manageable. We explain this directly in the email.

**10. Can I register more than one property or entity?**
Not yet through a single signup — that's a bulk/multi-property signup feature we're building for after launch. Right now it's one property or entity per subscription, though if you register several under the same email, you'll get one combined email covering all of them, not a separate email for each.

**11. Do you guarantee you'll catch every single change?**
No — we're honest about this upfront. The Registro Público itself can have errors or delays, and our automated checks can occasionally fail or be temporarily blocked. This is a monitoring tool, not a substitute for your own independent verification on anything important.

**12. How does Atlas Panama get this information — do you have special access?**
No special access. Everything we check is public information anyone could look up themselves at the Registro Público — we just do it for you, automatically, every day.

## Pricing & Billing

**13. How much does it cost?**
We're starting at $1/month or $10/year as a promotional launch price. We'll raise the price to $2/month after a few months. If you're already subscribed before that happens, you keep your original price.

**14. Do you offer a discount for registering multiple properties?**
Not yet — volume pricing for multi-property subscriptions is planned alongside the bulk signup feature, coming after launch.

**15. Does my subscription auto-renew?**
Yes, automatically, unless you cancel first.

**16. How do I cancel?**
Through your subscription management link — cancel anytime, and it takes effect at the end of your current billing period.

**17. Do you offer refunds?**
No — subscriptions aren't refunded for time already billed.

**18. Will I be reminded before my subscription renews?**
Yes — you'll get a heads-up a few days before renewal either way: a simple "you're all set, here's how to cancel if you want" if you're auto-renewing normally, or "you're about to lose coverage" if there's a payment issue.

## Privacy & Legal

**19. Who sees my personal information?**
Only what's needed to run the service: Stripe (payment processing) and Postmark (email delivery). We don't share your information with the Registro Público — our checks use our own credentials, not yours — and we don't sell your data.

**20. Is it legal to monitor a property I don't own?**
Yes, provided you have a legitimate interest in it — as a prospective buyer, investor, lender, or other professional reason. The Registro Público is public information; that's the whole point of a public registry.

**21. What should I do if I see a change I don't recognize?**
Contact an attorney or accountant right away. Atlas Panama's alerts are informational, not legal or financial advice.

**22. What happens if there's a dispute between me and Atlas Panama?**
It's governed by Panamanian law, resolved through binding arbitration in Panama — not US courts.

## Account & Technical

**23. What languages is this available in?**
Spanish and English.

**24. Do you send WhatsApp notifications?**
Not yet — we collect your preference at signup, and it's planned as a future addition once the subscriber base grows.

**25. What happens if a daily check fails?**
We automatically retry. If it still fails, you'll get a brief "we couldn't check today" email, and we try again at the next scheduled check.

**26. Can I change my registered email or language preference after signing up?**
Yes — through your account profile page, where you can view and update your information yourself. (See the profile-tab feature note in the project's build log — planned so subscribers never need to email in for routine changes.)

## Registro Público — Answered

**27. In plain, non-legal language, what is "Prelación"?**
It's the queue/process a document goes through at the Registro Público before it becomes official — a deed, a court order, a power of attorney, or similar gets submitted, reviewed, and either rejected, sent back for corrections, or approved. Once approved, it updates the permanent record.

**28. Are there properties with very little or no real digital record — e.g., older land with no recent transactions?**
Yes — older properties or entities with no recent activity may not show a complete digital record. The first time any change is made, the property goes through a "migración a folio electrónico" (migration to an electronic folio), where whatever historical information the Registro Público has gets uploaded into the new digital record.

**29. Can foreigners (non-Panamanian citizens/residents) use this service?**
Yes — there's no restriction at all tied to citizenship or residency.

**30. How long does a typical Prelación entry take to resolve?**
It varies widely: as fast as 24 hours if an express fee (*alteración de turno*, around $300) is paid, to weeks or even months for a legal matter. Typical processing is a few days to a week, and timing also depends on how much volume the Registro Público is handling at that moment.

**31. Are there properties or ownership situations the Registro Público doesn't cover?**
Yes — the Registro Público does not have records for untitled land (*derechos posesorios*/possessory rights). Atlas Panama can't monitor what isn't in the registry.

**32. If a property has multiple co-owners, can each one subscribe independently?**
Each subscription covers one email address. If multiple owners each want their own monitoring, each needs to subscribe separately — though owners are always free to share the emails they receive amongst themselves.

**33. Does this work the same way for property held through a trust (fideicomiso)?**
Yes. A property in a fideicomiso shows up in the Registro Público under the fiduciary's (*fiduciario*'s) name, but each individual finca still has its own independent record — you can monitor it exactly as if the property were in your own name, regardless of how many other properties that same fiduciary holds in trust.

**34. What if you can't find my property or entity when I sign up?**
If two search attempts don't find a match, you'll be prompted to email us at operations@atlaspanama.com with as much information as you have — we'll help you find it, free of charge.

**35. Do embargo/secuestro cases get different guidance than a routine sale?**
No — all changes get the same type of notification and the same standard guidance: if you don't recognize or didn't authorize it, contact your attorney or accountant.
