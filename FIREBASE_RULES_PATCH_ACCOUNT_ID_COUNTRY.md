# Firebase Rules patch — country + public account ID + occupied GDPS accountID

Apply these changes to the existing Realtime Database Rules. Do not replace unrelated rules.

## 1. Replace the existing `players` block

```json
"players": {
  ".read": true,
  ".write": "auth != null && root.child('moderators').child(auth.uid).child('role').val() === 'admin'",
  "$player": {
    "country": {
      ".write": "auth != null && (root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (root.child('users').child(auth.uid).child('identityVerified').val() === true && ((root.child('users').child(auth.uid).child('verifiedDemonListUsername').isString() && root.child('users').child(auth.uid).child('verifiedDemonListUsername').val() === $player) || ((!root.child('users').child(auth.uid).child('verifiedDemonListUsername').exists() || root.child('users').child(auth.uid).child('verifiedDemonListUsername').val() === '') && root.child('users').child(auth.uid).child('verifiedGdpsUsername').isString() && root.child('users').child(auth.uid).child('verifiedGdpsUsername').val() === $player))))",
      ".validate": "newData.isString() && newData.val().matches(/^[A-Z]{2}$/)"
    }
  }
}
```

## 2. Add `country` inside `users -> $uid`

Place this next to `bio`, `displayName`, etc.

```json
"country": {
  ".validate": "newData.isString() && newData.val().matches(/^[A-Z]{2}$/) && (auth.uid === $uid || root.child('moderators').child(auth.uid).child('role').val() === 'admin' || newData.val() === data.val())"
},
```

The old `avatar` rule may remain for backward compatibility. The website no longer exposes or uses avatar selection.

## 3. Add `accountIds` at the root of `rules`

```json
"accountIds": {
  ".read": "auth != null",
  ".write": "auth != null && (root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (data.child('initialized').val() === true && newData.child('initialized').val() === true && newData.child('initializedAt').val() === data.child('initializedAt').val() && data.child('counter').isNumber() && newData.child('counter').val() === data.child('counter').val() + 1 && root.child('users').child(auth.uid).child('usernameKey').isString() && !data.child('byUsername').child(root.child('users').child(auth.uid).child('usernameKey').val()).exists() && newData.child('byUsername').child(root.child('users').child(auth.uid).child('usernameKey').val()).val() === newData.child('counter').val() && newData.child('byId').child(newData.child('counter').val() + '').val() === root.child('users').child(auth.uid).child('usernameKey').val()))",
  "initialized": {
    ".validate": "root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (data.exists() && newData.val() === data.val())"
  },
  "counter": {
    ".validate": "root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (data.isNumber() && newData.isNumber() && newData.val() === data.val() + 1)"
  },
  "initializedAt": {
    ".validate": "root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (data.exists() && newData.val() === data.val())"
  },
  "byUsername": {
    "$username": {
      ".validate": "root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (data.exists() && newData.val() === data.val()) || (!data.exists() && newData.isNumber() && newData.val() > 0 && $username === root.child('users').child(auth.uid).child('usernameKey').val() && newData.val() === newData.parent().parent().child('counter').val())"
    }
  },
  "byId": {
    "$id": {
      ".validate": "root.child('moderators').child(auth.uid).child('role').val() === 'admin' || (data.exists() && newData.val() === data.val()) || (!data.exists() && newData.isString() && $id === newData.parent().parent().child('counter').val() + '' && newData.val() === root.child('users').child(auth.uid).child('usernameKey').val())"
    }
  },
  "$other": {
    ".validate": false
  }
},
```

The first admin who opens the site after these rules are active initializes IDs for all existing `/users` sorted by `createdAt`. After that, each newly created account atomically receives the next number.

## 4. Add `gdpsAccountTaken` at the root of `rules`

```json
"gdpsAccountTaken": {
  ".read": "auth != null",
  "$accountId": {
    ".write": "auth != null && root.child('moderators').child(auth.uid).exists() && (root.child('moderators').child(auth.uid).child('role').val() === 'admin' || root.child('moderators').child(auth.uid).child('permissions').child('canAddRecords').val() === true)",
    ".validate": "newData.val() === true"
  }
},
```

When a moderator/admin is logged in, the website mirrors already approved `gdpsAccountLinks` into this boolean-only registry. Ordinary users can check whether an accountID is occupied without receiving another user's Firebase UID.
