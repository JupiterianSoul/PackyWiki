# Rescuing a collection from an older install

You only need this once, and only if you have an install signed with one of
the throwaway keys the CI used to generate (anything built before the
`Sign every build with one fixed key` commit).

## Why it is needed

Android identifies an app by the certificate that signed it. Until that
commit the Android build had no `signingConfig`, so Gradle fell back to
`~/.android/debug.keystore` - and a CI runner is a fresh machine every time,
so it **generated a brand new random key on every build**. Every APK therefore
looked like a different app: none would install over the last, and uninstalling
to make room took the WebView's localStorage - the whole collection - with it.

That is fixed. The key now lives in the repo at
`android/keystore/wikster-debug.keystore` and every build is signed with it, so
updates install in place from here on. But the key that signed *your current
install* was random and was destroyed with the runner that made it, so there is
no way to sign an update that Android will accept over it.

Newer builds carry **Settings → Data → Transfer your save**, which makes this a
non-issue in future. The install you have now predates that button, so the save
has to come out through the debugger instead.

## Getting the save out

The build is debuggable, which is what makes this possible.

1. On the phone: **Settings → About phone → tap Build number seven times**,
   then **Settings → System → Developer options → USB debugging**, on.
2. Plug the phone into a computer and accept the "Allow USB debugging" prompt.
3. Open **Wikster** on the phone and leave it on screen.
4. On the computer, open Chrome (or Edge) and go to **`chrome://inspect`**.
   The Wikster WebView appears under the phone's name. Click **inspect**.
5. In the DevTools **Console** that opens, paste this and press Enter:

```js
copy(JSON.stringify({
  format: 'wikster-save', version: 1, at: Date.now(),
  data: Object.fromEntries([
    'wikster.collection.v3', 'wikster.wallet.v1', 'wikster.inventory.v1',
    'wikster.profile.v1', 'wikster.customPacks.v2', 'wikster.language',
    'wikster.ripDirection', 'wikster.theme'
  ].map((k) => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null))
}))
```

`copy()` puts the result on the computer's clipboard. Paste it into a text file
and keep it. (If `copy()` is unavailable, drop it and use the printed string -
right-click the result and *Copy string contents*.)

## Putting it back

1. Uninstall Wikster, install the new APK, and go through the first-run
   language choice.
2. **Profile → Settings → Data → Transfer your save → Open**.
3. Paste the text into the lower box. It will tell you what it found - card
   count, level, balance - before it does anything.
4. **Load this save**, then tap again to confirm. The app reloads with
   everything back, including the language and theme.

The paste box refuses anything that is not a Wikster save, and it replaces the
whole save rather than merging, so you cannot end up with half of each.

## From now on

- Every build shares one signing key, so updates install over the top.
- `versionCode` rises with each CI build, so Android always sees a newer one.
- `allowBackup` is on, so Android's own backup carries the save to a new phone.
- And the manual transfer is in Settings whenever you want a copy of your own.
