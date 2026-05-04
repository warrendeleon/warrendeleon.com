---
title: "Certificate pinning in React Native for Supabase (TrustKit + network_security_config)"
description: "Lock the React Native HTTP layer to specific public-key pins so the app refuses to talk to anyone but real Supabase. TrustKit, NSC, rotation."
publishDate: 2026-06-29
tags: ["react-native", "security", "supabase", "tls", "certificate-pinning"]
locale: en
heroImage: "/images/blog/certificate-pinning-rn.webp"
heroAlt: "Certificate pinning in React Native"
campaign: "certificate-pinning-rn"
relatedPosts: ["building-an-axios-based-supabase-auth-client", "building-a-supabase-storage-client-with-retry", "building-a-supabase-rest-client-without-the-sdk"]
---

This is part 5 of the [Supabase-without-the-SDK series](/blog/building-a-supabase-rest-client-without-the-sdk/). The previous posts covered the [auth client](/blog/building-an-axios-based-supabase-auth-client/), [token refresh](/blog/token-refresh-race-condition-react-native/), and [storage client](/blog/building-a-supabase-storage-client-with-retry/). They all assume the network layer is trustworthy. This post is what makes that assumption hold.

Certificate pinning locks the HTTPS connection to specific public-key hashes. The app refuses to talk to any host whose certificate doesn't match one of the configured pins, even if a system-trusted certificate authority signed it. That defends against rogue CAs, MITM proxies on hostile Wi-Fi, and corporate root certificates installed on managed devices.

> ⚠️ **Operational warning.** Certificate pinning is a network hardening feature with a self-inflicted-DoS failure mode. Ship pinning without backup pins, expiration monitoring, and a rotation plan, and a missed cert rotation turns into a remote kill switch for your own app: every user on the previous build can no longer reach your backend. Read the rotation section below before enabling enforcement on a release build.

Source: [`ios/warrendeleon/AppDelegate.swift`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/ios/warrendeleon/AppDelegate.swift) and [`android/app/src/main/res/xml/network_security_config.xml`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/android/app/src/main/res/xml/network_security_config.xml).

## What pinning actually defends against

Standard HTTPS trusts any certificate signed by a CA in the OS trust store. That's typically 100+ root CAs across iOS and Android. If *any* of them are compromised, malicious, or coerced into issuing a fraudulent certificate for your domain, the app accepts the connection and the attacker reads everything in plaintext.

Three concrete scenarios cert pinning blocks:

1. **A rogue CA issues a fake `*.supabase.co` certificate.** This has happened to real CAs in real incidents. Without pinning, your app trusts the fake cert because the CA is in the OS trust store; with pinning, the public key hash doesn't match and the connection fails closed.
2. **A corporate MITM proxy on enterprise Wi-Fi.** IT departments install root certs on managed devices to inspect TLS traffic. Without pinning, the proxy can read every Supabase request; with pinning, the app refuses to talk through the proxy at all.
3. **A device with a malicious profile installed.** iOS configuration profiles or Android user-installed CAs can grant trust to attacker-controlled certificates. Without pinning, the app trusts them; with pinning, only the configured public keys count.

The trade-off is real: pinning makes the app more rigid. If your pins expire, the app stops working until you ship a new build. The rest of this post is about how to set pins up so they fail safely and how to rotate them without locking users out.

## Assumptions

The setup below was written against:

- React Native 0.74+ (bare workflow)
- iOS 13+ and Android API 24+ (the OS-level pinning APIs require API 24 for Android; for older Android, you'd use OkHttp's `CertificatePinner` instead)
- A Supabase project at a known stable hostname (this matters for pin extraction)
- The auth and storage clients from earlier posts in this series

Expo managed workflow doesn't expose the native config files this post relies on. Cert pinning on Expo requires a custom dev client.

## Extracting the pins

The pins are SHA-256 hashes of the **public key** in the certificate, not the certificate itself. That's what makes them survive certificate renewal: as long as the same key pair gets reused (which Supabase does for `*.supabase.co`), the public-key hash stays the same even when the certificate is reissued.

Extract two pins. The first from your domain's leaf certificate; the second from the intermediate CA. The intermediate is the backup that protects you when the leaf rotates.

```bash
# Primary pin: leaf certificate's public key
openssl s_client \
  -servername your-project.supabase.co \
  -connect your-project.supabase.co:443 </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64

# Backup pin: intermediate certificate's public key.
# awk 'n==2' skips the leaf (n==1) and captures the second BEGIN..END block.
openssl s_client \
  -servername your-project.supabase.co \
  -connect your-project.supabase.co:443 \
  -showcerts </dev/null 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/{n++} n==2' \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Both commands return base64 strings that look like `PzfKSv758ttsdJwUCkGhW/oxG9Wk1Y4N+NMkB5I7RXc=`. Save them, you'll paste both into the iOS and Android config below.

> ⚠️ **Sanity-check that the two pins are different.** A naive range pattern like `awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/'` (without the `n==2` block-counter) captures *all* certificate blocks concatenated, and the downstream pipe consumes only the first one. The "backup" silently equals the primary, leaving you with one pin pretending to be two. If both extractions produce the same hash, the pipeline is wrong and your backup pin isn't a backup.

> 💡 **Why two pins, not one?** OWASP and TrustKit both require a backup pin for a reason. If the leaf cert gets compromised and Supabase rotates only the leaf, an app with a single leaf-only pin breaks. With the intermediate as a backup, the connection still validates because the backup pin still matches. You buy yourself a window to ship a new app build with a fresh primary pin.

## iOS: TrustKit

[TrustKit](https://github.com/datatheorem/TrustKit) is the standard iOS pinning library. It hooks into the URLSession delegate chain and validates pins on every TLS handshake.

### Add the pod

```ruby
# ios/Podfile
target 'YourApp' do
  # ... existing pods ...
  pod 'TrustKit', '~> 3.0'
end
```

```bash
cd ios && pod install && cd ..
```

### Configure in AppDelegate.swift

```swift
// ios/YourApp/AppDelegate.swift
import TrustKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let trustKitConfig: [String: Any] = [
      kTSKSwizzleNetworkDelegates: true,
      kTSKPinnedDomains: [
        "your-project.supabase.co": [
          kTSKIncludeSubdomains: true,
          kTSKEnforcePinning: true,
          kTSKPublicKeyHashes: [
            "REPLACE_WITH_PRIMARY_PIN=",   // Leaf certificate
            "REPLACE_WITH_BACKUP_PIN=",    // Intermediate CA
          ],
        ],
      ],
    ]
    TrustKit.initSharedInstance(withConfiguration: trustKitConfig)

    // ... rest of your app initialisation
    return true
  }
}
```

The four config keys that matter:

| Key | Purpose |
|---|---|
| `kTSKSwizzleNetworkDelegates: true` | Lets TrustKit hook into every URLSession created by the app and React Native, so all Axios calls go through pinning automatically. |
| `kTSKIncludeSubdomains: true` | Pins apply to subdomains too. Useful because Supabase Storage and Realtime live on the same parent domain. |
| `kTSKEnforcePinning: true` | Fail closed. If the pin doesn't match, the connection is rejected. Set to `false` and pinning becomes report-only, which is useful during initial rollout but useless as a defence. |
| `kTSKPublicKeyHashes` | The two base64-encoded SHA-256 hashes from the openssl extraction above. |

> 💡 **Don't forget the pod install.** TrustKit is a native iOS library; it has to be linked into the binary. A pod install that didn't run is the most common reason "pinning isn't working" reports turn out to be "pinning was never enabled".

## Android: Network Security Config

Android 7+ ships with declarative cert pinning via `network_security_config.xml`. No third-party library required.

### The config file

```xml
<!-- android/app/src/main/res/xml/network_security_config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production: HTTPS-only, no cleartext -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Pin Supabase -->
    <domain-config>
        <domain includeSubdomains="true">supabase.co</domain>
        <pin-set expiration="2027-01-01">
            <pin digest="SHA-256">REPLACE_WITH_PRIMARY_PIN=</pin>
            <pin digest="SHA-256">REPLACE_WITH_BACKUP_PIN=</pin>
        </pin-set>
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </domain-config>

    <!-- Allow localhost in development for the React Native bundler -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>     <!-- Android emulator -->
        <domain includeSubdomains="true">10.0.3.2</domain>     <!-- Genymotion -->
    </domain-config>
</network-security-config>
```

### Wire it into the manifest

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

That's it. No library, no native code, no manual pinning logic. Android validates pins on every TLS handshake to the configured domains.

### Why the localhost block matters

The base config sets `cleartextTrafficPermitted="false"`, which blocks plain HTTP everywhere by default. The Metro bundler in development serves the JavaScript bundle over plain HTTP from `localhost`. Without the explicit localhost exception, debug builds can't reach Metro and the app crashes on launch with a network error.

The exception only applies when the app is running on a developer's machine. Production builds connect to Supabase (HTTPS, pinned) and never hit localhost.

## Pin expiration

Both iOS and Android configs above include an expiration. iOS doesn't enforce it directly, but TrustKit logs a warning. Android does enforce it: when `expiration` passes, the pin set is ignored and the OS falls back to standard CA validation (which is exactly the threat pinning was meant to defend against).

The right approach is to **monitor expiration as a build-time check**, not rely on the OS to remind you. A 90-day-out alert gives you enough time to extract new pins, ship an updated build, and let users update before the old pins expire.

A simple shell script you can run as part of CI:

```bash
#!/bin/bash
# scripts/check-pin-expiration.sh
EXPIRATION="2027-01-01"
DAYS_UNTIL=$(( ( $(date -d "$EXPIRATION" +%s) - $(date +%s) ) / 86400 ))

if [ "$DAYS_UNTIL" -lt 90 ]; then
  echo "::warning::Certificate pin expires in $DAYS_UNTIL days ($EXPIRATION)"
  echo "Run scripts/extract-pins.sh and ship a new build before then."
fi
```

Wire that into a GitHub Action that runs weekly, and the team gets a notification before a pin expires rather than after.

## The rotation problem (and how not to brick your users)

Pin rotation is the part where most cert-pinning implementations fail in production. The naive approach (extract a new pin, ship a build) locks out everyone who hasn't updated yet, because their app still has the old pins and Supabase is now serving the new cert.

The pattern that actually works is **overlap windows**:

1. **Today (build N).** App pins `[primary_v1, intermediate]`. Supabase serves a cert chained to `intermediate`. Both pins match.
2. **3 months before primary_v1 expires (build N+1).** Add the *next* primary pin (`primary_v2`) to the configuration. App now pins `[primary_v1, primary_v2, intermediate]`. Ship the build, encourage updates.
3. **Cert rotation day.** Supabase rotates from `primary_v1` to `primary_v2`. Old app builds (N) still validate because `intermediate` matches. New builds (N+1) validate because `primary_v2` matches.
4. **3 months after rotation (build N+2).** Remove `primary_v1` from the configuration since it's no longer in any deployed cert. Pins are `[primary_v2, intermediate_v2_if_changed]`.

The invariant is that **every active app build has at least one pin that matches the current Supabase cert chain at all times.** The intermediate pin is the load-bearing piece during rotation: as long as Supabase keeps using the same CA, intermediate-pin-only validation gets you through.

That's why backup pins exist. Without them, certificate rotation is a coordination nightmare that requires every user to update on the day the cert rotates. With them, rotation is a non-event for users; they update at their own pace within a multi-month window.

## Skip pinning under test runners

Pinning interferes with end-to-end test frameworks that intercept network traffic. Detox, Cypress, and Appium all rely on inspecting WebSocket and HTTP communication that wouldn't validate under strict pinning.

The skip has to happen at **build time**, not runtime. A runtime check that reads `ProcessInfo.processInfo.arguments` for a Detox flag is tempting because it's small, but it ships into the release binary too. Anyone with the IPA can launch the production app with that flag (via Xcode, lldb, or a jailbroken device) and disable cert pinning. The defence the rest of this post built up gets undone by an opt-in launch argument.

On iOS, use a compile-time guard:

```swift
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(...) -> Bool {
#if !DETOX_BUILD
    TrustKit.initSharedInstance(withConfiguration: trustKitConfig)
#endif
    // ... rest of app initialisation
    return true
  }
}
```

Define `DETOX_BUILD` in a separate Xcode scheme used only for E2E builds. The release scheme doesn't have the flag, so the `#if` evaluates to "always init pinning" and the runtime check doesn't exist in the binary.

> ⚠️ **Don't ship a runtime arg check.** A pattern like `ProcessInfo.processInfo.arguments.contains("-detoxServer")` works fine in development but compiles into the release binary. An attacker with the IPA can launch with that argument and pinning silently disables. Use `#if DEBUG` or a custom build flag instead, so the skip only exists in builds that aren't going to users.

On Android, point the manifest at an alternate `network_security_config_debug.xml` referenced only from `debug` build variants. The release variant uses the strict config; the debug variant is permissive. Same principle: build-time separation, not runtime branch.

The general rule: pinning is a *production* defence. Tests should never rely on it being active, and the binary that ships should never have a way to turn it off.

## Verifying pinning is on

The mistake that wastes the most time is shipping a build that doesn't actually pin. Three checks that catch this fast.

**iOS: install a malicious root cert and visit the app.** Tools like Charles Proxy or mitmproxy install a root cert on the device. With pinning off, the app talks to Supabase through the proxy and you can read every request. With pinning on, the app fails to connect and Charles shows TLS handshake failures. If the proxy is reading your traffic, pinning isn't enabled.

**Android: same approach.** Install Charles' root cert on the emulator. A debug build with the permissive network config will go through the proxy. A release build with the strict config will fail TLS. If the release build also goes through, you've shipped without pinning.

**At runtime: check the TrustKit logs.** The shared instance logs every pin validation event when `kTSKSwizzleNetworkDelegates` is true. Filter the device log for `TrustKit` and you should see entries like `Pin validation succeeded for your-project.supabase.co`. No log lines means TrustKit isn't being called, which usually means the swizzling didn't take effect (often because the code path that creates URLSessions runs before `TrustKit.initSharedInstance`).

## Common pitfalls

**Don't pin the certificate. Pin the public key.** The openssl commands at the top of this post extract the public key, not the cert. Pinning the cert means rotation breaks every app that hasn't updated. Pinning the public key means rotation only breaks apps when the *key pair* changes, which is much rarer.

**Don't forget the intermediate.** A leaf-only pin set is a pinning configuration with one bullet in the chamber. The day Supabase rotates the leaf cert (which happens whenever the upstream CA reissues; on Let's Encrypt-style CAs that's often inside a 90-day window), every user without the latest build is locked out. The intermediate pin is what gives you the rotation overlap.

**Don't rely on `kTSKEnforcePinning: false` permanently.** Report-only mode is useful for the first week of rollout when you want to confirm pinning isn't breaking real users. After that, switch it to `true`. A report-only pin is a security control that doesn't actually control anything.

**Don't pin third-party CDNs you don't control.** If your app loads Sentry, Mixpanel, or Cloudflare URLs and you pin them, you're now responsible for tracking those vendors' cert rotation schedules. Pin only the domains you own and that you can coordinate rotation with.

**Don't forget to test pinning on a release build.** Debug builds on Android use a different network security config. A working debug build tells you nothing about whether your release build will pin correctly. Run the smoke test (Charles + release build on a real device) before shipping.

## What's next in the series

Pinning protects against attackers reading your Supabase traffic on the wire. The next concern is the traffic the app sends to *its own* observability stack: Sentry breadcrumbs, analytics events, log lines. Without sanitisation, those payloads carry user emails, access tokens, password fields, and phone numbers straight to a third-party log destination, which moves the security boundary from the device to whoever can read your Sentry project.

The next post in the series covers PII-masking interceptors: a logger and an Axios interceptor that strip sensitive fields before they reach Sentry, with regex patterns and a custom log function that protect tokens, emails, and phone numbers automatically.

Source: [`ios/warrendeleon/AppDelegate.swift`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/ios/warrendeleon/AppDelegate.swift) and [`android/app/src/main/res/xml/network_security_config.xml`](https://github.com/warrendeleon/rn-warrendeleon/blob/main/android/app/src/main/res/xml/network_security_config.xml). Each post in this series is filed under [the supabase tag at warrendeleon.com](https://warrendeleon.com/blog/tag/supabase/).
