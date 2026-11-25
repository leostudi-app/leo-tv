# LEO TV

Fire TV / Android TV app for [LEO – Play & Learn](https://play.leostudi.app).

A full-screen WebView around the web app that adds what TV browsers lack:
- sound and videos start without a tap,
- LEO speaks using the device's own text-to-speech (`window.LeoNative` bridge),
- remote and game-controller buttons work, Back goes back inside the app.

## Build
Every push builds an APK with GitHub Actions. Results (log, status, APK) are pushed to the `builds` branch,
and successful builds are published as the `latest` release.

## Install on Fire TV
Settings → My Fire TV → Developer options → allow Downloader to install apps, then open the APK link in Downloader.

The signing key in `app/` is a personal sideloading key. Replace it with a secret-held release key before any store submission.
