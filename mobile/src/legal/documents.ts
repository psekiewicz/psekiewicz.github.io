// The legal documents, held as data so one copy feeds every screen that shows
// them and nothing drifts between the app and the website.
//
// IMPORTANT, BEFORE RELEASE: the three constants below are placeholders. They
// are deliberately obvious rather than invented, because a privacy policy that
// names the wrong controller, or gives an address nobody reads, is worse than
// one that admits it is unfinished. Fill them in, and have the result read by
// somebody qualified - none of this was written by a lawyer.

/** The person or company that runs Showcase and answers for the data in it. */
export const OPERATOR = '[OPERATOR NAME]';
/** Where privacy requests, reports and appeals actually arrive. */
export const CONTACT_EMAIL = '[CONTACT EMAIL]';
/** Whose courts and law govern the terms. */
export const JURISDICTION = '[COUNTRY]';

/** The date the wording last changed. Bump it when the wording changes. */
export const LEGAL_UPDATED = '26 September 2026';

/** The youngest an account holder may be, matching the check at sign-up. */
export const MINIMUM_AGE = 13;

export type LegalSection = {
  heading: string;
  /** Each entry is a paragraph. A line starting with "- " draws as a bullet. */
  body: string[];
};

export type LegalDocument = {
  key: 'terms' | 'privacy' | 'guidelines';
  title: string;
  /** One line under the title, saying what the document is for. */
  summary: string;
  sections: LegalSection[];
};

const TERMS: LegalDocument = {
  key: 'terms',
  title: 'Terms of Service',
  summary: `The agreement between you and ${OPERATOR} for using Showcase.`,
  sections: [
    {
      heading: 'What Showcase is',
      body: [
        'Showcase is a place to publish things you have made - music, video, images, apps and anything else - and to find work by other people. It runs as a website and as this Android app. Both use the same account and the same data.',
        `Showcase is run by ${OPERATOR}. These terms are an agreement between you and ${OPERATOR}. By creating an account or using Showcase, you accept them. If you do not accept them, do not use Showcase.`,
      ],
    },
    {
      heading: 'Who may use it',
      body: [
        `You must be at least ${MINIMUM_AGE} years old to hold an account. Every account carries a date of birth, and one that would make the holder younger than that is refused.`,
        'An account held by someone between 13 and 15 needs a parent or guardian to agree to it. Until they do, the account can read Showcase but cannot publish, comment, like, follow, save or report - and that is enforced by the database rather than by hiding buttons. The restriction lifts on its own when the account holder turns 16.',
        'A date of birth can be filled in once and not changed afterwards. If it was entered wrongly, write to ' + CONTACT_EMAIL + '.',
        `You may hold one account. Keep the details on it accurate, and keep your password to yourself - anything done from your account is treated as done by you. Tell us at ${CONTACT_EMAIL} if you think somebody else has got into it.`,
        'If your account has been banned, you may not create another one to get around the ban.',
      ],
    },
    {
      heading: 'What you post stays yours',
      body: [
        'You keep every right you already had in what you publish on Showcase. Nothing here transfers ownership.',
        `You do give ${OPERATOR} permission to host, store, copy and display what you publish, so that Showcase can do the thing you asked it to do: show your work to other people, in feeds, on your profile, in search, and in the Scrolls feed. That permission is limited to running and promoting Showcase itself, it earns us nothing on its own, and it ends for new displays when you delete the entry or your account.`,
        'You promise that what you publish is yours to publish - that you made it, or have permission for it - and that showing it on Showcase breaks no law and no one else’s rights.',
      ],
    },
    {
      heading: 'What you may not do',
      body: [
        'The Community Guidelines are part of these terms and describe what belongs on Showcase and what does not. Beyond those:',
        '- Do not break the law with it, or use Showcase to help somebody else break the law.',
        '- Do not upload or link to anything designed to damage, disable or gain unauthorised access to a device, an account or a system.',
        '- Do not try to read, change or delete data that is not yours, or to get around the permission checks that stop you.',
        '- Do not scrape Showcase in bulk, or hammer it with automated traffic.',
        '- Do not impersonate anybody, or pretend an entry is somebody else’s work.',
        '- Do not use Showcase to send unsolicited advertising.',
      ],
    },
    {
      heading: 'Points, XP, levels and shop items',
      body: [
        'XP, levels, points, achievements and the cosmetic items in the shop exist inside Showcase and nowhere else. They are not money, they are not property, and they have no cash value. They cannot be bought with money, sold, transferred between accounts, or exchanged for anything outside Showcase.',
        'What things cost, what they are worth, and how they are earned can change, and items can be withdrawn or altered. If your account is deleted - by you or by us - whatever it held goes with it, and nothing is owed to you for it.',
      ],
    },
    {
      heading: 'Other people’s content, and links out',
      body: [
        `Most of what you see on Showcase was published by other users. They are responsible for it, not ${OPERATOR}. We do not check entries before they appear.`,
        'Entries can carry links to other services - YouTube, Vimeo, Spotify, SoundCloud, a repository, a live site. Opening one takes you to that service, which has its own terms and its own privacy policy. We do not control those services and are not responsible for them.',
      ],
    },
    {
      heading: 'Moderation, and losing your account',
      body: [
        'Anyone signed in can report an entry. Administrators can unpublish or delete an entry, and can suspend or delete an account, where something breaks these terms or the Community Guidelines, or where the law requires it.',
        `We will try to act proportionately, and to act on serious things quickly. If you think a decision was wrong, write to ${CONTACT_EMAIL} and say so - a person will read it.`,
        'You can delete your own account at any time from Settings. Deleting it removes your profile and the entries, comments, likes, follows and saves attached to it. That cannot be undone.',
      ],
    },
    {
      heading: 'Showcase comes as it is',
      body: [
        'Showcase is provided free, as it is, without any warranty. We do not promise it will be available, that it will be free of faults, or that anything you publish will be kept forever. Keep your own copy of anything you care about.',
        'Features can change or be removed, and Showcase could be shut down entirely. If that happens we will try to give reasonable notice so you can take your work with you.',
      ],
    },
    {
      heading: 'Liability',
      body: [
        `To the extent the law allows, ${OPERATOR} is not liable for indirect or consequential loss, for lost profit, or for the loss of data or content arising from your use of Showcase.`,
        'Nothing here limits liability that cannot be limited by law - including liability for death or personal injury caused by negligence, or for fraud.',
        'Nothing here removes rights you have as a consumer under the law where you live.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'These terms can change. When they change in a way that matters, we will say so in the app before the change takes effect. Carrying on using Showcase after that means you accept the new version. If you do not, delete your account.',
      ],
    },
    {
      heading: 'Law, and getting in touch',
      body: [
        `These terms are governed by the law of ${JURISDICTION}, and its courts have jurisdiction - except where the law where you live gives you the right to bring a claim closer to home.`,
        `Questions about these terms go to ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  key: 'privacy',
  title: 'Privacy Policy',
  summary: 'What Showcase knows about you, why, and what you can make it do about that.',
  sections: [
    {
      heading: 'Who is responsible',
      body: [
        `${OPERATOR} decides what personal data Showcase collects and why, and so is the data controller for it. Write to ${CONTACT_EMAIL} about anything in this policy.`,
      ],
    },
    {
      heading: 'What Showcase collects',
      body: [
        'Your account. An email address and a password, handled by Supabase Auth - the password is stored as a hash, and nobody at Showcase can read it. Your email address is never shown to other users.',
        'Your profile. A display name, a short bio, and an avatar, which is a link to an image you already have somewhere else rather than a file you upload to us.',
        'Your date of birth. Held so we know whether an account belongs to someone under 16, which decides whether a parent has to agree to it before the account can publish anything. It is never shown on your profile, no other user can read it, and it is stored apart from the public profile for that reason. Where a parent has to agree, we keep their email address and when they confirmed, as the record of who agreed; it is deleted with the account.',
        'What you publish and do. Entries, their titles, descriptions, tags and links; comments; likes; who you follow; what you save to your private shelf; and any reports you file.',
        'How entries are read. Showcase counts a view when an entry is opened. A view records which entry, when, and - if you were signed in - which account, so the same person is not counted twice. Showcase does not record your IP address in its own database, and uses no analytics or advertising services. The services that carry the traffic (listed below) keep short-lived server logs, which include IP addresses, as any web server does.',
        'Notifications. If you turn notifications on in the app, your phone checks Showcase for new likes, comments and follows in the background, about every 15 minutes, and shows them itself. Nothing is registered with a push service, and turning notifications off stops the checks.',
        'Settings on your device. Your theme and motion preferences, the tab you last used and similar conveniences are kept on the device itself and are never sent to us.',
      ],
    },
    {
      heading: 'Why, and on what legal basis',
      body: [
        '- To give you the service you asked for - your account, your entries, your feed, your notifications. Legal basis: performance of our contract with you.',
        '- To keep Showcase working and safe: view counts, rate limits, reports and moderation. Legal basis: our legitimate interest in a service that works and is not abused.',
        '- To show notifications on your phone. Legal basis: your consent, which you can withdraw at any time in Settings or in Android’s own settings.',
        '- To know the age of each account holder, and to get a parent’s agreement for those aged 13 to 15. Legal basis: our legal obligation to get that agreement for younger users.',
        '- To meet other legal obligations, where one applies.',
      ],
    },
    {
      heading: 'What is public and what is not',
      body: [
        'Public, to anyone, signed in or not: your display name, bio and avatar; when your account was created; your published entries; your comments; your likes; who you follow and who follows you; your level, XP and achievements, and the counts behind them - views, distinct viewers, likes and comments your entries received; your points balance and the shop items you own and wear; and your place on the leaderboard.',
        'Not public: your email address; your drafts; your saved shelf, which nobody else can see and which earns its author nothing; and reports you file, which not even you can read back - being able to check whether a report landed is being able to keep re-filing until it does.',
      ],
    },
    {
      heading: 'Who else sees it',
      body: [
        'Showcase does not sell personal data, and does not share it for advertising. It is handled by these services on our behalf:',
        '- Supabase - the database, authentication, and the two small server functions Showcase runs. Your account and everything in it lives there, as our processor.',
        '- GitHub Pages - serves the Showcase website.',
        '- esm.sh - delivers the code libraries the website loads into your browser.',
        '- Resend - sends the one email to a parent or guardian, so it receives their address and the account’s display name.',
        '- images.weserv.nl - an image proxy used only when an avatar’s own host refuses to serve it directly.',
        'Separately, entries can show a player from YouTube, Vimeo, Spotify or SoundCloud, pictures and avatars hosted anywhere on the web, and YouTube thumbnails. Your browser or the app loads these straight from those services when the entry is on screen, so they see your IP address and may set their own cookies, under their own privacy policies rather than this one. Opening a link in an entry hands you to whoever runs it in the same way.',
      ],
    },
    {
      heading: 'How long it is kept',
      body: [
        'Your account and its content are kept until you delete them. Deleting your account from Settings removes your profile, entries, comments, likes, follows and saves, and the deletion cascades through the database rather than hiding things from view.',
        'Backups taken before a deletion can take a short time to age out.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'If the GDPR applies to you, you can ask us to give you a copy of your personal data, correct it, delete it, restrict what we do with it, or hand it over in a portable form. You can object to processing we base on legitimate interests. Where we rely on your consent, you can withdraw it without affecting what was done beforehand.',
        `Much of this you can do yourself: Settings edits your profile, and deletes your account outright. For anything else, write to ${CONTACT_EMAIL}.`,
        'You can also complain to your data protection authority. In Poland that is the President of the Personal Data Protection Office (UODO).',
      ],
    },
    {
      heading: 'Children',
      body: [
        `Showcase is not for anyone under ${MINIMUM_AGE}. Sign-up asks for a date of birth, and an account whose holder would be younger than that is refused.`,
        'An account held by someone between 13 and 15 needs a parent or guardian to agree to it. We ask for their email address and send them one message with a link to a page where they confirm; until they do, the account can read Showcase but cannot publish, comment, like, follow, save or report. That restriction is enforced by the database, not by hiding buttons. It lifts on its own when the account holder turns 16.',
        `If you believe a child under ${MINIMUM_AGE} has an account here, write to ${CONTACT_EMAIL} and it will be removed.`,
      ],
    },
    {
      heading: 'Security, and where the data sits',
      body: [
        'Access is enforced by the database itself through row level security, not only by what the app chooses to show - so a request for data that is not yours is refused at the source. Traffic is encrypted in transit.',
        'No service is perfectly secure, and we cannot promise otherwise.',
        'Data is stored by Supabase in eu-west-1 (Ireland), inside the European Economic Area. GitHub, esm.sh and Resend may handle requests outside it, including in the United States; those transfers rest on the safeguards in their own terms.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'This policy can change. The date at the top says when the wording last moved, and a change that matters will be announced in the app before it takes effect.',
      ],
    },
  ],
};

const GUIDELINES: LegalDocument = {
  key: 'guidelines',
  title: 'Community Guidelines',
  summary: 'What belongs on Showcase, what does not, and what happens when something is reported.',
  sections: [
    {
      heading: 'The short version',
      body: [
        'Showcase is for showing what you made. Post your own work, be straight about what it is, and leave other people room to do the same.',
      ],
    },
    {
      heading: 'Post your own work',
      body: [
        'Publish things you made, or that you have permission to publish. If your entry builds on somebody else’s work - a cover, a remix, a dub, a fork - say so, and credit them.',
        'Do not pass somebody else’s work off as your own, and do not re-upload an entry that is not yours.',
      ],
    },
    {
      heading: 'What is not allowed',
      body: [
        '- Anything sexual involving a minor. This is reported to the authorities and the account is removed, with no warning and no appeal.',
        '- Sexual content generally. Showcase is open to teenagers and is not the place for it.',
        '- Harassment, threats, or pile-ons aimed at a person.',
        '- Hate directed at people for who they are - race, ethnicity, nationality, religion, disability, sex, gender identity or sexual orientation.',
        '- Violent content meant to shock, and anything glorifying violence or its perpetrators.',
        '- Encouraging self-harm, suicide or eating disorders.',
        '- Somebody else’s private information - an address, a phone number, a document - posted without their agreement.',
        '- Malware, phishing, or links that are not what they claim to be.',
        '- Spam: the same entry over and over, tags that have nothing to do with the entry, or engagement bait.',
        '- Impersonating a person or an organisation.',
        '- Anything illegal where you are, or where Showcase is run.',
      ],
    },
    {
      heading: 'Tag it for what it is',
      body: [
        'Pick the content type that matches the entry, and use tags that describe it honestly. A misleading title or thumbnail wastes everyone’s time and is treated as spam.',
      ],
    },
    {
      heading: 'Reporting something',
      body: [
        'Any signed-in user can report an entry that is not their own, with a reason and an optional note. One report per entry per person - a second one adds nothing.',
        'Reports are not readable by the person who filed them, deliberately: being able to watch a report land is being able to keep re-filing until it does.',
        'Reporting something as a way of attacking its author is itself a breach of these guidelines.',
      ],
    },
    {
      heading: 'What happens next',
      body: [
        'Reported entries go to a moderation queue, one row per entry rather than one per report, so something reported ten times is looked at once and properly.',
        'Depending on what is found, an entry may be left alone, unpublished, or deleted, and an account may be warned, suspended for a period, or deleted.',
        `If you think a decision went the wrong way, write to ${CONTACT_EMAIL}. Say what was removed and why you think it should not have been.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS, PRIVACY, GUIDELINES];

export function legalDocument(key: LegalDocument['key']) {
  return LEGAL_DOCUMENTS.find((d) => d.key === key) ?? TERMS;
}
