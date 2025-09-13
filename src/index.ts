import { Client, simpleFetchHandler } from "@atcute/client";
import type { Did } from "@atcute/lexicons";
import { AppBskyActorProfile } from "@atcute/bluesky";

const client = new Client({
  handler: simpleFetchHandler({ service: "https://pds.indexx.dev" }),
});

async function getRepos(
  cursor: string | undefined = undefined,
  dids: Did[] = [],
): Promise<Did[]> {
  const response = await client.get("com.atproto.sync.listRepos", {
    params: { cursor },
  });

  if (!response.ok) {
    console.error("failed to get data from pds");
    return [];
  }

  dids.push(...response.data.repos.map((d) => d.did));

  if (response.data.cursor) {
    getRepos(response.data.cursor, dids);
  }

  return dids;
}

// i'm only exporting a subset of the profile data containing only what i need
export interface UserProfile {
  did: Did;
  handle: string;
  displayName?: string;
  avatar?: string;
  prioritized: boolean;
}

async function getUsersProfile(
  did: Did,
): Promise<Omit<UserProfile, "prioritized"> | undefined> {
  const responseRec = await client.get("com.atproto.repo.getRecord", {
    params: {
      repo: did,
      collection: "app.bsky.actor.profile",
      rkey: "self",
    },
    as: "json",
  });

  if (!responseRec.ok) {
    console.error("failed to fetch user profiles");
    return undefined;
  }

  const user = responseRec.data.value as AppBskyActorProfile.Main;

  let avatar: string | undefined = undefined;
  if (user.avatar) {
    // @ts-expect-error: Error
    const av = user.avatar.ref["$link"];
    avatar = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${av}`;
  }

  const responseId = await client.get("com.atproto.repo.describeRepo", {
    params: { repo: did },
    as: "json",
  });

  if (!responseId.ok) {
    console.error("failed to resolve identity");
    return undefined;
  }

  return {
    did,
    handle: responseId.data.handle,
    displayName: user.displayName ?? undefined,
    avatar,
  };
}

export async function getPdsUsers(): Promise<UserProfile[]> {
  const repos = await getRepos();
  const prioritizedDidsList = [
    "did:plc:sfjxpxxyvewb2zlxwoz2vduw",
    "did:plc:zl4ugdpxfgrzlr5uz2nm7kcq",
    "did:plc:wfa54mpcbngzazwne3piz7fp",
  ];
  const prioritizedDidsSet = new Set(prioritizedDidsList);

  const prioritizedProfilesMap = new Map<Did, UserProfile>();
  const otherProfiles: UserProfile[] = [];

  const promises = repos.map(async (did) => {
    const profile = await getUsersProfile(did);
    if (profile) {
      if (prioritizedDidsSet.has(did)) {
        prioritizedProfilesMap.set(did, { ...profile, prioritized: true });
      } else {
        otherProfiles.push({ ...profile, prioritized: false });
      }
    }
  });

  await Promise.all(promises);

  const prioritizedProfiles = prioritizedDidsList
    .map((did) => prioritizedProfilesMap.get(did as `did:${string}:${string}`))
    .filter((p): p is UserProfile => p !== undefined);

  return [...prioritizedProfiles, ...otherProfiles];
}

export async function getVersion(): Promise<string> {
  const response = await fetch("https://pds.indexx.dev/xrpc/_health");

  if (!response.ok) {
    console.error("failed to get records count from pds");
    return "0";
  }

  const data = await response.json();

  return data.version;
}
