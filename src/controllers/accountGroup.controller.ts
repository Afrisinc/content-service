import { accountGroupService } from '@/services/accountGroup.service';
import { CreateAccountGroupPayload, UpdateAccountGroupPayload } from '@/types/accountGroup.types';
import { UnauthorizedError } from '@/utils/http-error';
import { success } from '@/utils/response';
import { FastifyReply, FastifyRequest } from 'fastify';

interface GroupParams {
  id: string;
}

interface GroupAccountParams extends GroupParams {
  accountId: string;
}

function requireUserId(request: FastifyRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('authentication required');
  }
  return userId;
}

export async function listAccountGroups(request: FastifyRequest, reply: FastifyReply) {
  const groups = await accountGroupService.list(requireUserId(request));
  return success(reply, 200, 'Account groups retrieved', 1000, { groups });
}

export async function getAccountGroup(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const group = await accountGroupService.get(requireUserId(request), id);
  return success(reply, 200, 'Account group retrieved', 1000, group);
}

export async function createAccountGroup(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CreateAccountGroupPayload;
  const group = await accountGroupService.create(requireUserId(request), body);
  return success(reply, 201, `${group.name} created`, 1001, group);
}

export async function updateAccountGroup(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const body = request.body as UpdateAccountGroupPayload;
  const group = await accountGroupService.update(requireUserId(request), id, body);
  return success(reply, 200, `${group.name} updated`, 1002, group);
}

export async function duplicateAccountGroup(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const group = await accountGroupService.duplicate(requireUserId(request), id);
  return success(reply, 201, `${group.name} created`, 1001, group);
}

export async function deleteAccountGroup(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  await accountGroupService.remove(requireUserId(request), id);
  return success(reply, 200, 'Account group deleted', 1003, {});
}

export async function addAccountsToGroup(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const { accountIds } = request.body as { accountIds: string[] };
  const group = await accountGroupService.addAccounts(requireUserId(request), id, accountIds);
  return success(reply, 200, 'Accounts added to group', 1002, group);
}

export async function removeAccountFromGroup(request: FastifyRequest, reply: FastifyReply) {
  const { id, accountId } = request.params as GroupAccountParams;
  const group = await accountGroupService.removeAccount(requireUserId(request), id, accountId);
  return success(reply, 200, 'Account removed from group', 1003, group);
}

export async function setGroupAccountActive(request: FastifyRequest, reply: FastifyReply) {
  const { id, accountId } = request.params as GroupAccountParams;
  const { isActive } = request.body as { isActive: boolean };
  const group = await accountGroupService.setAccountActive(
    requireUserId(request),
    id,
    accountId,
    isActive
  );
  return success(reply, 200, isActive ? 'Account activated' : 'Account paused', 1002, group);
}

export async function listGroupAssets(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const assets = await accountGroupService.listAssets(requireUserId(request), id);
  return success(reply, 200, 'Brand photographs retrieved', 1000, { assets });
}

export async function assignGroupAssets(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const { assetIds } = request.body as { assetIds: string[] };
  const assets = await accountGroupService.assignAssets(requireUserId(request), id, assetIds);
  return success(reply, 200, 'Photographs added to this brand', 1002, { assets });
}

export async function unassignGroupAsset(request: FastifyRequest, reply: FastifyReply) {
  const { id, assetId } = request.params as GroupParams & { assetId: string };
  const assets = await accountGroupService.unassignAsset(requireUserId(request), id, assetId);
  return success(reply, 200, 'Photograph removed from this brand', 1003, { assets });
}

export async function getGroupTargets(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GroupParams;
  const targets = await accountGroupService.resolveTargets(requireUserId(request), id);
  return success(reply, 200, 'Group publishing targets resolved', 1000, { targets });
}
