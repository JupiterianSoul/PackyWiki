/**
 * THE ACCOUNT
 *
 * Everything that talks to Supabase, split by concern under src/account:
 * client (the connection), errors, session, profile, save (the cloud save and
 * its build-stamp guard), schema (what this database actually has), social
 * (friends, presence, chat, deliveries, trades), market (auctions) and index
 * (the codex and wishlists). This file is the public face: the app imports
 * from here and nothing else needs to know where a function lives.
 */
export { configured, supabase, USERNAME_RE } from './account/client.js';
export { readableError } from './account/errors.js';
export {
  indexSchemaReady,
  codexAdd,
  codexCounts,
  codexPage,
  wishlistMine,
  wishlistSet,
  wishlistOf,
  friendsWishes
} from './account/index.js';
export {
  marketSchemaReady,
  listAuctions,
  createAuction,
  placeBid,
  cancelAuction,
  settleAuction,
  subscribeAuctions,
  openChatChannel
} from './account/market.js';
export { getProfile, ensureProfile, profileForSession, publishStats } from './account/profile.js';
export {
  remoteBuildStamp,
  saveFromNewerBuild,
  saveFromOlderBuild,
  pushSave,
  clearSave,
  hardReset,
  deleteAccount,
  fetchSave,
  listBackups,
  restoreBackup,
  syncOnLogin
} from './account/save.js';
export {
  socialSchemaReady,
  socialTablesReady,
  forgetSchemaProbe,
  SCHEMA_OUTDATED
} from './account/schema.js';
export {
  verifySession,
  currentSession,
  onAuthChange,
  signIn,
  signUp,
  claimUsername,
  signOut,
  sendReset
} from './account/session.js';
export {
  searchPlayers,
  listFriendships,
  sendRequest,
  acceptRequest,
  removeFriendship,
  friendCollection,
  hasPresence,
  isOnline,
  changeUsername,
  updateProfileFields,
  heartbeat,
  listMessages,
  sendChatMessage,
  markConversationRead,
  unreadBySender,
  sendDelivery,
  pendingDeliveries,
  claimDelivery,
  proposeTrade,
  openTrades,
  setTradeStatus
} from './account/social.js';
