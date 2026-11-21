/**
 * What we ask Microsoft for when somebody signs in.
 *
 * Chat.Read was here while the Teams page existed. The page is gone, so
 * the scope is too: asking people for access to their private chats and
 * then not reading them is not something to leave sitting in a consent
 * screen.
 *
 * One constant, used by every place that starts a Microsoft OAuth, because
 * the refresh token that comes back is only as broad as the grant that
 * produced it - and all of those grants write to the same `outlook_refresh`
 * cookie. If the Vault's step-up re-auth asked for less than the login
 * does, signing in would work, verifying for the Vault would quietly
 * replace the token with a narrower one, and Teams would stop loading with
 * nothing to show why.
 *
 * Every scope here is one a person can consent to for themselves. Nothing
 * needs an administrator to approve it for the tenant, and nothing is
 * metered: the Microsoft 365 licence they already have covers it. The
 * tenant-wide alternatives - ChannelMessage.Read.All for team channels,
 * Presence.Read.All for everyone's presence - deliberately aren't here.
 *
 * Adding a scope means Microsoft shows the consent screen once more, to
 * each person, the next time they sign in. That is the only cost of
 * changing this line.
 */
export const MS_USER_SCOPES = "email offline_access Calendars.Read";
