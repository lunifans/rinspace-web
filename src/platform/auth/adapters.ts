import type {
  AuthAdapter,
  RuntimeAuthSnapshot,
  RuntimeCapability,
} from '@/platform/runtime';
import {
  clearStoredSession,
  completePhoneOtp as completeLegacyPhoneOtp,
  getAuthAccessToken,
  getAuthDeviceId,
  getCurrentAuthUser,
  getStoredSession,
  sendPhoneOtp as sendLegacyPhoneOtp,
  type CloudUser,
  type OtpChallenge,
} from '@/services/phoneAuth';
import { loadCurrentUserInfo } from '@/services/domains/identity';
import { loadProfile } from '@/services/profile';
import {
  clearTopbarSessionSnapshot,
  readTopbarSessionSnapshot,
  writeTopbarSessionSnapshot,
  type TopbarSessionSnapshot,
  type TopbarUserProfile,
} from '@/services/topbarSessionSnapshot';
import type { DemoPersona } from '@/app/bootstrap/types';
import { demoPersonaStorageKey } from '@/app/bootstrap/demoRuntime';
import { demoMemberIdentity } from '@/demo/persona';
import {
  demoInterfaceIdentityFromPreference,
  demoInterfacePreferenceKey,
  demoProfileIdentityFromPreference,
  demoProfilePreferenceKey,
} from '@/demo/identity';
import { getDemoRepositoryRuntime } from '@/demo/repository';

const authSyncChannelName = 'rinspace-auth-v1';
export const authSyncStorageKey = 'rinspace-auth-sync-v1';

type AuthSyncMessage = Readonly<{
  version: 1;
  source: string;
  sequence: number;
  action: 'changed' | 'signed-out';
}>;

type MutableAuthState = {
  snapshot: RuntimeAuthSnapshot;
  listeners: Set<(snapshot: RuntimeAuthSnapshot) => void>;
  restoreRequest: Readonly<{
    generation: number;
    request: Promise<RuntimeAuthSnapshot>;
  }> | null;
  generation: number;
  started: boolean;
  stopSync: (() => void) | null;
};

function frozenSet(values: readonly RuntimeCapability[]): ReadonlySet<RuntimeCapability> {
  const set = new Set(values);
  return new Proxy(set, {
    get(target, property) {
      if (property === 'add' || property === 'delete' || property === 'clear') {
        return () => { throw new TypeError('Runtime capabilities are immutable.'); };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const emptyCapabilities = frozenSet([]);

function freezeSnapshot(input: {
  status: RuntimeAuthSnapshot['status'];
  user: RuntimeAuthSnapshot['user'];
  roles?: readonly string[];
  capabilities?: ReadonlySet<RuntimeCapability>;
}): RuntimeAuthSnapshot {
  return Object.freeze({
    status: input.status,
    user: input.user ? Object.freeze({ ...input.user }) : null,
    roles: Object.freeze([...(input.roles ?? [])]),
    capabilities: input.capabilities ?? emptyCapabilities,
  });
}

const guestSnapshot = () => freezeSnapshot({ status: 'guest', user: null });

export function runtimeRolesFromBackendIdentity(identity: Readonly<{
  role_id?: number;
  role_name?: string;
}> | null): readonly string[] {
  const isAdmin = identity?.role_id === 2 || identity?.role_name === 'admin';
  const isModerator = isAdmin || identity?.role_id === 3 || identity?.role_name === 'moderator';
  return Object.freeze([
    'member',
    ...(isModerator ? ['moderator'] : []),
    ...(isAdmin ? ['admin'] : []),
  ]);
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function cachedSnapshotToAuth(cached: TopbarSessionSnapshot): RuntimeAuthSnapshot {
  const displayName =
    cached.profile?.nickname ||
    cached.nickname ||
    cached.user.username ||
    'Rin user';
  const avatarUrl = cached.profile?.avatarDataUrl || cached.avatarDataUrl || null;
  const roles = [
    'member',
    ...(cached.isModerator ? ['moderator'] : []),
    ...(cached.isAdmin ? ['admin'] : []),
  ];
  return freezeSnapshot({
    status: 'authenticated',
    user: {
      id: cached.user.id || '',
      username: cached.user.username || '',
      publicUserId: cached.publicUserId || cached.user.username || '',
      displayName,
      avatarUrl,
      language: cached.language || '',
      colorScheme: cached.colorScheme || '',
    },
    roles,
  });
}

function initialCloudSnapshot(): RuntimeAuthSnapshot {
  const session = getStoredSession();
  if (!session) return guestSnapshot();
  const cached = readTopbarSessionSnapshot();
  if (cached) return cachedSnapshotToAuth(cached);
  return freezeSnapshot({ status: 'restoring', user: null });
}

function emit(state: MutableAuthState, snapshot: RuntimeAuthSnapshot): RuntimeAuthSnapshot {
  if (state.snapshot === snapshot) return snapshot;
  state.snapshot = snapshot;
  for (const listener of state.listeners) listener(snapshot);
  return snapshot;
}

function syntheticSessionSnapshot(subject = ''): RuntimeAuthSnapshot {
  return freezeSnapshot({
    status: 'authenticated',
    user: {
      id: subject,
      username: '',
      publicUserId: '',
      displayName: 'Rin user',
      avatarUrl: null,
      language: '',
      colorScheme: '',
    },
    roles: ['member'],
  });
}

function syncMessage(value: unknown): value is AuthSyncMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<AuthSyncMessage>;
  return message.version === 1 &&
    typeof message.source === 'string' &&
    typeof message.sequence === 'number' &&
    (message.action === 'changed' || message.action === 'signed-out');
}

function randomSourceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `auth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createCrossTabSync(onRemoteChange: () => void): {
  start(): () => void;
  publish(action: AuthSyncMessage['action']): void;
} {
  const source = randomSourceId();
  let sequence = 0;
  let channel: BroadcastChannel | null = null;
  const seenSequences = new Map<string, number>();
  let storageListener: ((event: StorageEvent) => void) | null = null;

  const accept = (value: unknown) => {
    if (!syncMessage(value) || value.source === source) return;
    const seenSequence = seenSequences.get(value.source) ?? 0;
    if (value.sequence <= seenSequence) return;
    seenSequences.set(value.source, value.sequence);
    onRemoteChange();
  };

  return {
    start() {
      if (typeof window === 'undefined') return () => undefined;
      if (typeof BroadcastChannel === 'function') {
        channel = new BroadcastChannel(authSyncChannelName);
        channel.addEventListener('message', (event) => accept(event.data));
      } else {
        storageListener = (event) => {
          if (event.key !== authSyncStorageKey || !event.newValue) return;
          try { accept(JSON.parse(event.newValue) as unknown); } catch { /* Ignore corrupt peer state. */ }
        };
        window.addEventListener('storage', storageListener);
      }
      return () => {
        channel?.close();
        channel = null;
        if (storageListener) window.removeEventListener('storage', storageListener);
        storageListener = null;
      };
    },
    publish(action) {
      const message: AuthSyncMessage = {
        version: 1,
        source,
        sequence: ++sequence,
        action,
      };
      if (channel) {
        channel.postMessage(message);
        return;
      }
      try {
        window.localStorage.setItem(authSyncStorageKey, JSON.stringify(message));
        window.localStorage.removeItem(authSyncStorageKey);
      } catch {
        // Cross-tab sync is best effort and must not make login/logout fail.
      }
    },
  };
}

function cloudUserProfile(user: CloudUser): TopbarUserProfile {
  return {
    nickname:
      optionalString(user.user_metadata?.nickName) ||
      optionalString(user.user_metadata?.nickname),
    avatarDataUrl:
      optionalString(user.user_metadata?.avatarUrl) ||
      optionalString(user.user_metadata?.avatar_url) ||
      optionalString(user.user_metadata?.picture),
  };
}

function createCloudStore(kind: AuthAdapter['kind']): AuthAdapter {
  const state: MutableAuthState = {
    snapshot: initialCloudSnapshot(),
    listeners: new Set(),
    restoreRequest: null,
    generation: 0,
    started: false,
    stopSync: null,
  };

  const currentGeneration = (generation: number) => generation === state.generation;
  const emitIfCurrent = (
    generation: number,
    snapshot: RuntimeAuthSnapshot,
  ): RuntimeAuthSnapshot => (
    currentGeneration(generation) ? emit(state, snapshot) : state.snapshot
  );
  const invalidateRestore = () => {
    state.generation += 1;
    state.restoreRequest = null;
  };

  const restoreOnce = async (generation: number): Promise<RuntimeAuthSnapshot> => {
    const session = getStoredSession();
    if (!session) {
      if (currentGeneration(generation)) clearTopbarSessionSnapshot();
      return emitIfCurrent(generation, guestSnapshot());
    }
    const cached = readTopbarSessionSnapshot();
    try {
      const user = await getCurrentAuthUser();
      if (!user?.id) {
        const currentSession = getStoredSession();
        if (!currentSession) {
          if (currentGeneration(generation)) clearTopbarSessionSnapshot();
          return emitIfCurrent(generation, guestSnapshot());
        }
        return emitIfCurrent(
          generation,
          cached ? cachedSnapshotToAuth(cached) : syntheticSessionSnapshot(currentSession.sub),
        );
      }

      const metadataProfile = cloudUserProfile(user);
      const [profileResult, currentInfo] = await Promise.all([
        loadProfile(user).catch(() => null),
        loadCurrentUserInfo().catch(() => null),
      ]);
      const profile = profileResult as TopbarUserProfile | null;
      const matchingCached = cached?.user.id === user.id ? cached : null;
      const nickname =
        profile?.nickname ||
        optionalString(currentInfo?.display_name) ||
        metadataProfile.nickname ||
        matchingCached?.nickname ||
        optionalString(user.username);
      const avatarUrl =
        profile?.avatarDataUrl ||
        optionalString(currentInfo?.avatar.custom) ||
        optionalString(currentInfo?.avatar.gravatar) ||
        metadataProfile.avatarDataUrl ||
        matchingCached?.avatarDataUrl ||
        '';
      const publicUserId = currentInfo?.username || matchingCached?.publicUserId || user.username || '';
      const roles = runtimeRolesFromBackendIdentity(currentInfo);
      const isAdmin = roles.includes('admin');
      const isModerator = roles.includes('moderator');
      const topbarSnapshot: TopbarSessionSnapshot = {
        authorizationSource: 'backend-identity-v1',
        user,
        profile,
        nickname,
        avatarDataUrl: avatarUrl,
        publicUserId,
        isAdmin,
        isModerator,
        language: currentInfo?.language || '',
        colorScheme: currentInfo?.color_scheme || '',
        cachedAt: Date.now(),
      };
      if (!currentGeneration(generation)) return state.snapshot;
      writeTopbarSessionSnapshot(topbarSnapshot);
      return emit(state, freezeSnapshot({
        status: 'authenticated',
        user: {
          id: user.id,
          username: user.username || '',
          publicUserId,
          displayName: nickname || user.username || 'Rin user',
          avatarUrl: avatarUrl || null,
          language: currentInfo?.language || '',
          colorScheme: currentInfo?.color_scheme || '',
        },
        roles,
      }));
    } catch {
      const currentSession = getStoredSession();
      if (!currentSession) {
        if (currentGeneration(generation)) clearTopbarSessionSnapshot();
        return emitIfCurrent(generation, guestSnapshot());
      }
      return emitIfCurrent(
        generation,
        cached ? cachedSnapshotToAuth(cached) : syntheticSessionSnapshot(currentSession.sub),
      );
    }
  };

  const restore = () => {
    const generation = state.generation;
    if (!state.restoreRequest || state.restoreRequest.generation !== generation) {
      const request = restoreOnce(generation).finally(() => {
        if (state.restoreRequest?.request === request) state.restoreRequest = null;
      });
      state.restoreRequest = { generation, request };
    }
    return state.restoreRequest.request;
  };
  const sync = createCrossTabSync(() => {
    invalidateRestore();
    void restore();
  });

  const adapter: AuthAdapter = {
    kind,
    getSnapshot: () => state.snapshot,
    getAccessToken: async () => (await getAuthAccessToken()) || null,
    getDeviceId: () => getAuthDeviceId(),
    subscribe(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    start() {
      if (state.started) return () => undefined;
      state.started = true;
      state.stopSync = sync.start();
      return () => {
        state.stopSync?.();
        state.stopSync = null;
        state.started = false;
      };
    },
    restore,
    async signOut() {
      invalidateRestore();
      clearStoredSession();
      clearTopbarSessionSnapshot();
      const snapshot = emit(state, guestSnapshot());
      sync.publish('signed-out');
      return snapshot;
    },
    sendPhoneOtp: sendLegacyPhoneOtp,
    async completePhoneOtp(challenge, token) {
      await completeLegacyPhoneOtp(challenge, token);
      invalidateRestore();
      const snapshot = await restore();
      sync.publish('changed');
      return snapshot;
    },
    updatePreferences(input) {
      const current = state.snapshot;
      if (!current.user) return current;
      const snapshot = freezeSnapshot({
        status: current.status,
        user: {
          ...current.user,
          language: input.language ?? current.user.language,
          colorScheme: input.colorScheme ?? current.user.colorScheme,
        },
        roles: current.roles,
        capabilities: current.capabilities,
      });
      const cached = readTopbarSessionSnapshot();
      if (cached) {
        writeTopbarSessionSnapshot({
          ...cached,
          language: snapshot.user?.language || '',
          colorScheme: snapshot.user?.colorScheme || '',
        });
      }
      return emit(state, snapshot);
    },
    updateProfile(input) {
      const current = state.snapshot;
      if (!current.user) return current;
      const snapshot = freezeSnapshot({
        status: current.status,
        user: {
          ...current.user,
          username: input.username ?? current.user.username,
          publicUserId: input.publicUserId ?? current.user.publicUserId,
          displayName: input.displayName ?? current.user.displayName,
          avatarUrl: input.avatarUrl === undefined ? current.user.avatarUrl : input.avatarUrl,
        },
        roles: current.roles,
        capabilities: current.capabilities,
      });
      const cached = readTopbarSessionSnapshot();
      if (cached) {
        writeTopbarSessionSnapshot({
          ...cached,
          nickname: snapshot.user?.displayName || '',
          avatarDataUrl: snapshot.user?.avatarUrl || '',
          publicUserId: snapshot.user?.publicUserId || '',
        });
      }
      return emit(state, snapshot);
    },
  };
  return Object.freeze(adapter);
}

export function createCloudBaseAuthAdapter(
  kind: 'cloudbase-auth' | 'compatible-auth' = 'cloudbase-auth',
): AuthAdapter {
  return createCloudStore(kind);
}

function demoSnapshot(
  persona: DemoPersona,
  capabilities: ReadonlySet<RuntimeCapability>,
  identity: NonNullable<RuntimeAuthSnapshot['user']> = demoMemberIdentity,
): RuntimeAuthSnapshot {
  if (persona === 'guest') return freezeSnapshot({ status: 'guest', user: null, capabilities });
  return freezeSnapshot({
    status: 'authenticated',
    user: identity,
    roles: ['member', 'author'],
    capabilities,
  });
}

function demoCapabilities(persona: DemoPersona): ReadonlySet<RuntimeCapability> {
  return persona === 'member'
    ? frozenSet(['content.read', 'content.interact', 'content.create', 'upload.local', 'demo.reset'])
    : frozenSet(['content.read', 'demo.reset']);
}

export function createDemoAuthAdapter(
  initialPersona: DemoPersona,
  capabilities: ReadonlySet<RuntimeCapability>,
  initialIdentity: Partial<NonNullable<RuntimeAuthSnapshot['user']>> = {},
): AuthAdapter {
  let memberIdentity = Object.freeze({ ...demoMemberIdentity, ...initialIdentity });
  const state: MutableAuthState = {
    snapshot: demoSnapshot(initialPersona, capabilities, memberIdentity),
    listeners: new Set(),
    restoreRequest: null,
    generation: 0,
    started: false,
    stopSync: null,
  };
  const unavailable = async (): Promise<never> => {
    throw new Error('Phone authentication is unavailable in demo mode.');
  };
  const setPersona = (persona: DemoPersona) => emit(
    state,
    demoSnapshot(persona, demoCapabilities(persona), memberIdentity),
  );
  const storedPersona = (): DemoPersona => {
    try {
      return window.localStorage.getItem(demoPersonaStorageKey) === 'member' ? 'member' : 'guest';
    } catch {
      return 'guest';
    }
  };
  const restore = async () => {
    const preservedInterface = {
      language: memberIdentity.language,
      colorScheme: memberIdentity.colorScheme,
    };
    memberIdentity = Object.freeze({ ...demoMemberIdentity, ...preservedInterface });
    const repository = getDemoRepositoryRuntime();
    if (repository) {
      const stored = await repository.transaction(
        ['preferences'],
        'readonly',
        async (transaction) => ({
          profile: await transaction.get('preferences', demoProfilePreferenceKey),
          interface: await transaction.get('preferences', demoInterfacePreferenceKey),
        }),
      );
      const profile = demoProfileIdentityFromPreference(stored.profile?.value);
      const interfacePreference = demoInterfaceIdentityFromPreference(stored.interface?.value);
      if (profile || interfacePreference) {
        memberIdentity = Object.freeze({ ...memberIdentity, ...profile, ...interfacePreference });
      }
    }
    return setPersona(storedPersona());
  };
  const sync = createCrossTabSync(() => {
    void restore();
  });
  const adapter: AuthAdapter = {
    kind: 'demo-auth',
    getSnapshot: () => state.snapshot,
    getAccessToken: async () => null,
    getDeviceId: () => null,
    subscribe(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    start() {
      if (state.started) return () => undefined;
      state.started = true;
      state.stopSync = sync.start();
      return () => {
        state.stopSync?.();
        state.stopSync = null;
        state.started = false;
      };
    },
    restore,
    async signOut() {
      try { window.localStorage.setItem(demoPersonaStorageKey, 'guest'); } catch { /* Optional persistence. */ }
      const snapshot = setPersona('guest');
      sync.publish('signed-out');
      return snapshot;
    },
    sendPhoneOtp: unavailable,
    completePhoneOtp: unavailable,
    updatePreferences(input) {
      const current = state.snapshot;
      if (!current.user) return current;
      memberIdentity = Object.freeze({
        ...memberIdentity,
        language: input.language ?? memberIdentity.language,
        colorScheme: input.colorScheme ?? memberIdentity.colorScheme,
      });
      const snapshot = emit(state, freezeSnapshot({
        status: current.status,
        user: memberIdentity,
        roles: current.roles,
        capabilities: current.capabilities,
      }));
      sync.publish('changed');
      return snapshot;
    },
    updateProfile(input) {
      const current = state.snapshot;
      if (!current.user) return current;
      memberIdentity = Object.freeze({
        ...memberIdentity,
        username: input.username ?? memberIdentity.username,
        publicUserId: input.publicUserId ?? memberIdentity.publicUserId,
        displayName: input.displayName ?? memberIdentity.displayName,
        avatarUrl: input.avatarUrl === undefined ? memberIdentity.avatarUrl : input.avatarUrl,
      });
      const snapshot = emit(state, freezeSnapshot({
        status: current.status,
        user: memberIdentity,
        roles: current.roles,
        capabilities: current.capabilities,
      }));
      sync.publish('changed');
      return snapshot;
    },
    setDemoPersona(persona) {
      try { window.localStorage.setItem(demoPersonaStorageKey, persona); } catch { /* Optional persistence. */ }
      const snapshot = setPersona(persona);
      sync.publish('changed');
      return snapshot;
    },
  };
  return Object.freeze(adapter);
}
