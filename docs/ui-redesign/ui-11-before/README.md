# UI 11変更前Performance UX証跡

## 取得条件

- Source head: `81e23db`
- Browser: Google Chrome 150.0.7871.184
- Lighthouse: 13.4.1
- Node.js: 22.22.3
- Next.js: 14.2.35 production build
- データ: 共有DBの146期
- Home: Mobile / Desktopをfresh profileで各3回
- 代表直リンク: 武将ランキング / 戦闘履歴をMobileで各1回

ユーザーの開発サーバーと`.next`を共有しない一時worktreeでbuildし、
専用portのproduction serverを測定後に終了・削除した。

## 読み方

Lighthouseの`simulated`値は、ローカルproduction serverが返す
9.3 MBの非圧縮JSONへ低速回線を適用するため、LCP / TTIが大きくなる。
同一環境のBefore / After比較には有効だが、Vercel本番値とはみなさない。

`observed`は監査時にChromeが実際に観測した値である。
Homeのobserved LCP中央値はMobile 1,420 ms、Desktop 1,578 msだった。

INPはLighthouseのページロード監査では取得できない。TBTと
Max Potential FIDは代理指標として残すが、INP適合の宣言には使わない。

## 主な発見

- 146期の`/api/state`本文: 9,304,903 B
- 戦闘履歴: 15,060件 / 8,554,680 B
- 武将DB: 1,203件 / 750,209 B
- Home初期通信のTurndown chunk: 5,351 B transfer
- Home用dynamic chunkはstate取得と並列になり、state本文より先に完了
- Desktop sidebar復元のlayout shift: 0.00821
- Mobile HomeではSkeleton置換によりfooterが0.0191 shift
- Mobileランキング／履歴のCLS: 0.0522

数値、3回分の値、asset寸法、request順は
`performance-baseline.json`へ記録した。生のLighthouse reportはサイズと
環境依存情報を含むためcommitせず、再現に必要な要約だけを保存する。
