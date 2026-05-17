/**
 * sui-groups integration for Walrus Forms.
 *
 * Each published form gets a PermissionedGroup<WF> (WF = walrus_forms::form_registry::WF).
 * The group tracks who has been explicitly shared access.
 *
 * Flow:
 *   publish form → create_form_group PTB call → group transferred to owner
 *   resolve submission → grantViewer(submitterAddress) in same PTB
 *   "Shared with you" tab → query PermissionsGranted events for caller's address
 */

import {
  SuiGroupsClient,
  SuiGroupsCall,
  TESTNET_SUI_GROUPS_PACKAGE_CONFIG,
  MAINNET_SUI_GROUPS_PACKAGE_CONFIG,
} from "@mysten/sui-groups";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";
import { NETWORK, PACKAGE_ID } from "@/config";

// Witness type that scopes PermissionedGroup to Walrus Forms.
export const WF_WITNESS_TYPE = `${PACKAGE_ID}::form_registry::WF`;

// "Can view this form in dashboard" — extension permission managed by owner.
export const VIEWER_PERMISSION = `${PACKAGE_ID}::form_registry::Viewer`;

const GROUPS_PKG =
  NETWORK === "mainnet"
    ? MAINNET_SUI_GROUPS_PACKAGE_CONFIG
    : TESTNET_SUI_GROUPS_PACKAGE_CONFIG;

export function makeGroupsClient(suiClient: ClientWithCoreApi): SuiGroupsClient {
  return new SuiGroupsClient({
    client: suiClient as unknown as ConstructorParameters<typeof SuiGroupsClient>[0]["client"],
    witnessType: WF_WITNESS_TYPE,
    packageConfig: GROUPS_PKG,
  });
}

export function makeGroupsCall(): SuiGroupsCall {
  return new SuiGroupsCall({
    packageConfig: GROUPS_PKG,
    witnessType: WF_WITNESS_TYPE,
  });
}

/**
 * Add create_form_group to an existing PTB.
 * Returns the PermissionedGroup result — caller should transfer it to sender.
 *
 * Example:
 *   const group = appendCreateFormGroup(tx);
 *   tx.transferObjects([group], tx.pure.address(ownerAddress));
 */
export function appendCreateFormGroup(tx: Transaction) {
  return tx.moveCall({
    target: `${PACKAGE_ID}::form_registry::create_form_group`,
    arguments: [],
  });
}

/**
 * Append a grantPermission call for the Viewer role to an existing PTB.
 * Requires the caller to own the group (have PermissionsAdmin or ExtensionPermissionsAdmin).
 *
 * @param tx - Transaction to append to
 * @param groupId - PermissionedGroup object ID
 * @param member - Address to grant Viewer to
 */
export function appendGrantViewer(tx: Transaction, groupId: string, member: string) {
  const call = makeGroupsCall();
  tx.add(
    call.grantPermission({
      groupId,
      member,
      permissionType: VIEWER_PERMISSION,
    }),
  );
}

/**
 * Query all form group IDs where walletAddress has been granted any permission.
 * Uses PermissionsGranted events from the sui_groups package.
 * Returns group IDs (these map 1:1 to form group objects).
 */
export async function getGroupsForMember(
  suiClient: ClientWithCoreApi,
  walletAddress: string,
): Promise<string[]> {
  const eventType = `${GROUPS_PKG.originalPackageId}::permissioned_group::PermissionsGranted<${WF_WITNESS_TYPE}>`;

  try {
    const result = await (suiClient as unknown as {
      queryEvents: (opts: unknown) => Promise<{
        data: Array<{ parsedJson?: { group_id?: string; member?: string } }>;
      }>;
    }).queryEvents({
      query: { MoveEventType: eventType },
      limit: 500,
      order: "descending",
    });

    const groupIds = new Set<string>();
    for (const ev of result.data) {
      const json = ev.parsedJson;
      if (json?.member?.toLowerCase() === walletAddress.toLowerCase() && json.group_id) {
        groupIds.add(normalizeId(json.group_id));
      }
    }
    return Array.from(groupIds);
  } catch {
    return [];
  }
}

/**
 * Check if a wallet is a current member of a group.
 */
export async function isGroupMember(
  suiClient: ClientWithCoreApi,
  groupId: string,
  walletAddress: string,
): Promise<boolean> {
  const client = makeGroupsClient(suiClient);
  try {
    return await client.view.isMember({ groupId, member: walletAddress });
  } catch {
    return false;
  }
}

function normalizeId(id: string): string {
  if (!id.startsWith("0x")) return `0x${id}`;
  return id;
}
