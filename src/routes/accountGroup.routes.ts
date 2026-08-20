import {
  addAccountsToGroup,
  createAccountGroup,
  deleteAccountGroup,
  getAccountGroup,
  getGroupTargets,
  listAccountGroups,
  removeAccountFromGroup,
  setGroupAccountActive,
  updateAccountGroup,
} from '@/controllers/accountGroup.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import {
  AddAccountsToGroupSchema,
  CreateAccountGroupSchema,
  DeleteAccountGroupSchema,
  GetAccountGroupSchema,
  GetGroupTargetsSchema,
  ListAccountGroupsSchema,
  RemoveAccountFromGroupSchema,
  SetGroupAccountActiveSchema,
  UpdateAccountGroupSchema,
} from '@/schemas/requests/accountGroup.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['account-groups'];

export async function accountGroupRoutes(app: FastifyInstance) {
  app.get(
    '/account-groups',
    { schema: { ...ListAccountGroupsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listAccountGroups)
  );

  app.post(
    '/account-groups',
    { schema: { ...CreateAccountGroupSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(createAccountGroup)
  );

  app.get(
    '/account-groups/:id',
    { schema: { ...GetAccountGroupSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAccountGroup)
  );

  app.patch(
    '/account-groups/:id',
    { schema: { ...UpdateAccountGroupSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(updateAccountGroup)
  );

  app.delete(
    '/account-groups/:id',
    { schema: { ...DeleteAccountGroupSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(deleteAccountGroup)
  );

  app.post(
    '/account-groups/:id/accounts',
    { schema: { ...AddAccountsToGroupSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(addAccountsToGroup)
  );

  app.delete(
    '/account-groups/:id/accounts/:accountId',
    { schema: { ...RemoveAccountFromGroupSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(removeAccountFromGroup)
  );

  app.patch(
    '/account-groups/:id/accounts/:accountId',
    { schema: { ...SetGroupAccountActiveSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(setGroupAccountActive)
  );

  app.get(
    '/account-groups/:id/targets',
    { schema: { ...GetGroupTargetsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getGroupTargets)
  );
}
