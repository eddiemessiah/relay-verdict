import { toDataSuffix } from "@celo/attribution-tags";
import { concat, type Hex } from "viem";

// Assigned at hackathon registration (celobuilders skill). The leaderboard
// only counts transactions carrying this suffix — never send an untagged tx.
export const ATTRIBUTION_TAG =
  process.env.NEXT_PUBLIC_ATTRIBUTION_TAG ?? "";

/**
 * ERC-8021 suffix for every transaction this project sends. Extra codes
 * (e.g. a per-app code) may be passed; the assigned hackathon tag is always
 * included and is the one the leaderboard credits.
 */
export function attributionSuffix(extraCodes: string[] = []): Hex | undefined {
  const codes = ATTRIBUTION_TAG
    ? [...extraCodes, ATTRIBUTION_TAG]
    : extraCodes;
  if (codes.length === 0) return undefined;
  return toDataSuffix(codes);
}

/** Append the attribution suffix to calldata (ABI decoders ignore trailing bytes). */
export function withAttribution(data: Hex, extraCodes: string[] = []): Hex {
  const suffix = attributionSuffix(extraCodes);
  return suffix ? concat([data, suffix]) : data;
}
