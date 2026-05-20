// Steam libraries from DoctorMcKay don't ship TS types. We pull them in as
// `any` here so the worker compiles; the runtime contracts are well-documented
// at https://github.com/DoctorMcKay/node-steam-user and friends.

declare module 'steam-user';
declare module 'steamcommunity';
declare module 'steam-totp';
