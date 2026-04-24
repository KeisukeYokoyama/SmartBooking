/**
 * Smart Booking Phase 1 — DB・有効化・REST API 骨格の受け入れテスト。
 *
 * このファイルは破壊的処理（アンインストール）を含まない。
 * アンインストール検証は `phase1-uninstall.spec.js` に分離する。
 *
 * 前提:
 *   - wp-env 起動済み
 *   - Smart Booking プラグインは有効化済み
 *   - baseURL: http://localhost:8888
 */
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers');

/**
 * globalSetup で書き出した DB スナップショットを読み込む。
 * wp-env の CLI コンテナは並列呼び出しで race condition を起こすため、各テストは
 * スナップショット読み込みのみでアサートする。
 */
function loadDbSnapshot() {
  const p = path.resolve(__dirname, '.db-snapshot.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * 期待される smb_ テーブル名（prefix 込み）。dbDelta の作成順は実装依存なのでソート済みで比較。
 */
const EXPECTED_TABLES = [
  'wp_smb_custom_fields',
  'wp_smb_reservation_meta',
  'wp_smb_reservations',
  'wp_smb_schedules',
  'wp_smb_staff',
  'wp_smb_stores',
].sort();

/**
 * Smart Booking 管理画面の 5 サブメニューに対応する URL スラッグと期待ラベル。
 */
const ADMIN_PAGES = [
  { slug: 'smart-booking', label: 'スケジュール' },
  { slug: 'smart-booking-reservations', label: '予約一覧' },
  { slug: 'smart-booking-stores', label: '店舗・担当者' },
  { slug: 'smart-booking-form-settings', label: 'フォーム設定' },
  { slug: 'smart-booking-settings', label: '設定' },
];

// --- 1. DB: テーブル作成検証（WP-CLI） ----------------------------------------------------

test.describe('Phase 1: DB スキーマ', () => {
  test('1-1. smb_ テーブル 6 つすべてが存在する', () => {
    const snap = loadDbSnapshot();
    expect(snap.tables.sort()).toEqual(EXPECTED_TABLES);
  });

  test('1-2. デフォルト店舗 1 件が smb_stores に存在する', () => {
    const snap = loadDbSnapshot();
    expect(snap.storesCount).toBeGreaterThanOrEqual(1);
  });

  test('1-3. デフォルト担当者 1 件が smb_staff に存在する', () => {
    const snap = loadDbSnapshot();
    expect(snap.staffCount).toBeGreaterThanOrEqual(1);
  });

  test('1-4. 初期カスタムフィールド 3 件が smb_custom_fields に存在する', () => {
    const snap = loadDbSnapshot();
    expect(snap.customFieldsCount).toBeGreaterThanOrEqual(3);
  });
});

// --- 2. 管理画面: メニュー表示 + React マウント領域 -----------------------------------------

test.describe('Phase 1: 管理画面メニューとページ描画', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('2-1. 左サイドバーに Smart Booking トップメニューが登録されている', async ({
    page,
  }) => {
    await page.goto('/wp-admin/');
    // WP 管理画面の左サイドバーは mobile 幅では折りたたまれるため、DOM 上の存在と
    // 内容テキストのみを検証する（visibility は CSS 依存のため環境差が出る）.
    const topMenu = page.locator('#toplevel_page_smart-booking');
    await expect(topMenu).toHaveCount(1);
    await expect(topMenu).toContainText('Smart Booking');
  });

  for (const p of ADMIN_PAGES) {
    test(`2-2. サブメニューページ [${p.label}] が React マウント領域を出力する`, async ({
      page,
    }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`/wp-admin/admin.php?page=${p.slug}`);
      const mount = page.locator('#smart-booking-admin-app');
      await expect(mount).toHaveCount(1);

      // data-page 属性がルーティングに使われる想定。値の妥当性を確認.
      const dataPage = await mount.getAttribute('data-page');
      expect(
        ['schedule', 'reservations', 'stores', 'form-settings', 'settings'].includes(dataPage || '')
      ).toBeTruthy();

      // ページタイトル（WP の title）に "Smart Booking" か WordPress が含まれる.
      expect(await page.title()).toMatch(/Smart Booking|WordPress/i);

      // 致命的な JS エラーが出ていないこと（React 側はまだ空でも Uncaught は NG）.
      // 非致命的な警告（favicon 404 等）は除外.
      const fatal = errors.filter((e) => {
        if (/favicon/i.test(e)) return false;
        if (/ResizeObserver/i.test(e)) return false;
        return true;
      });
      expect(fatal, `Console errors on ${p.slug}:\n${fatal.join('\n')}`).toEqual([]);
    });
  }

  test('2-3. 5 サブメニューすべてが DOM に登録されている', async ({ page }) => {
    // WP 管理画面のサブメニューはホバー時に表示されるが、DOM 上は常に存在する。
    // visibility ではなく DOM の存在を確認する（hover は mobile で使えないため）.
    await page.goto('/wp-admin/');

    // 末尾一致の正規表現で他 slug への誤マッチを防ぐ（`page=smart-booking` は `-reservations` にも部分一致するため）.
    const expectedSlugs = [
      'smart-booking',
      'smart-booking-reservations',
      'smart-booking-stores',
      'smart-booking-form-settings',
      'smart-booking-settings',
    ];
    for (const slug of expectedSlugs) {
      const links = page.locator(`#toplevel_page_smart-booking .wp-submenu a`);
      const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
      const matched = hrefs.filter((h) => {
        if (!h) return false;
        // admin.php?page=<slug>($|&)
        return new RegExp(`[?&]page=${slug}(?:$|&|#)`).test(h);
      });
      expect(matched.length, `submenu link for ${slug}: matched=${JSON.stringify(hrefs)}`).toBe(1);
    }
  });

  test('2-4. メニューアイコンに dashicons-calendar-alt クラスが付与されている', async ({
    page,
  }) => {
    await page.goto('/wp-admin/');
    const icon = page.locator('#toplevel_page_smart-booking .wp-menu-image');
    await expect(icon).toHaveClass(/dashicons-calendar-alt/);
  });
});

// --- 3. REST API: 名前空間 + 認証/Nonce ------------------------------------------------------

test.describe('Phase 1: REST API', () => {
  test('3-1. ルート /wp-json/ に smart-booking/v1 名前空間が登録されている', async ({
    request,
  }) => {
    const res = await request.get('/wp-json/');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.namespaces)).toBeTruthy();
    expect(body.namespaces).toContain('smart-booking/v1');
  });

  test('3-2. 非ログイン状態で /wp-json/smart-booking/v1/stores への GET は 401/403 で拒否される', async ({
    request,
  }) => {
    const res = await request.get('/wp-json/smart-booking/v1/stores');
    expect([401, 403]).toContain(res.status());
  });

  test('3-3. 管理画面ログイン状態 + X-WP-Nonce 付きで /stores の GET が 200 を返す', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // Smart Booking 管理画面を開いて、wp_localize_script で注入される nonce を取得する.
    await page.goto('/wp-admin/admin.php?page=smart-booking');
    const ctx = await page.evaluate(() => {
      // smartBookingAdmin はプラグイン独自のグローバル.
      if (typeof window.smartBookingAdmin === 'undefined') return null;
      return {
        nonce: window.smartBookingAdmin.nonce,
        restUrl: window.smartBookingAdmin.restUrl,
      };
    });
    expect(ctx).not.toBeNull();
    expect(typeof ctx.nonce).toBe('string');
    expect(ctx.nonce.length).toBeGreaterThan(0);

    // ブラウザコンテキスト（Cookie 認証済）で fetch を叩くのが実態に最も近い.
    const result = await page.evaluate(async ({ nonce, restUrl }) => {
      const res = await fetch(restUrl + 'stores', {
        method: 'GET',
        headers: { 'X-WP-Nonce': nonce },
        credentials: 'same-origin',
      });
      return { status: res.status, body: await res.text() };
    }, ctx);

    expect(result.status).toBe(200);
  });

  // 各リソースに対する非ログインリクエスト（GET / POST / PUT / DELETE）が拒否されるか総当たり.
  const RESOURCES = ['stores', 'staff', 'schedules', 'reservations', 'custom-fields'];
  for (const resource of RESOURCES) {
    test(`3-4. 非ログイン状態で /${resource} の GET/POST が拒否される`, async ({
      request,
    }) => {
      const getRes = await request.get(`/wp-json/smart-booking/v1/${resource}`);
      expect(
        [401, 403],
        `GET /${resource} should be unauthorized (got ${getRes.status()})`
      ).toContain(getRes.status());

      const postRes = await request.post(`/wp-json/smart-booking/v1/${resource}`, {
        data: {},
      });
      expect(
        [401, 403],
        `POST /${resource} should be unauthorized (got ${postRes.status()})`
      ).toContain(postRes.status());
    });

    test(`3-5. 非ログイン状態で /${resource}/1 の PUT/DELETE が拒否される`, async ({
      request,
    }) => {
      const putRes = await request.put(`/wp-json/smart-booking/v1/${resource}/1`, {
        data: {},
      });
      expect(
        [401, 403],
        `PUT /${resource}/1 should be unauthorized (got ${putRes.status()})`
      ).toContain(putRes.status());

      const delRes = await request.delete(`/wp-json/smart-booking/v1/${resource}/1`);
      expect(
        [401, 403],
        `DELETE /${resource}/1 should be unauthorized (got ${delRes.status()})`
      ).toContain(delRes.status());
    });
  }

  test('3-6. 非ログイン状態で /settings の GET/POST が拒否される', async ({ request }) => {
    const getRes = await request.get('/wp-json/smart-booking/v1/settings');
    expect([401, 403]).toContain(getRes.status());
    const postRes = await request.post('/wp-json/smart-booking/v1/settings', { data: {} });
    expect([401, 403]).toContain(postRes.status());
  });

  test('3-7. Cookie 認証済でも nonce ヘッダなし or 不正な nonce では拒否される（X-WP-Nonce必須）', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const result = await page.evaluate(async () => {
      // nonce 未指定: WP は rest_cookie_check_errors で 401/403 を返す.
      const noNonce = await fetch('/wp-json/smart-booking/v1/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      });
      // 不正 nonce: あからさまに異なる値.
      const badNonce = await fetch('/wp-json/smart-booking/v1/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': 'invalidvalue' },
        credentials: 'same-origin',
        body: '{}',
      });
      return {
        noNonceStatus: noNonce.status,
        badNonceStatus: badNonce.status,
      };
    });

    // POST は書き込み系なので nonce 無しだと 401/403 のはず.
    expect(
      [401, 403],
      `POST /stores without nonce should be rejected (got ${result.noNonceStatus})`
    ).toContain(result.noNonceStatus);
    expect(
      [401, 403],
      `POST /stores with bad nonce should be rejected (got ${result.badNonceStatus})`
    ).toContain(result.badNonceStatus);
  });
});

// --- 4. wp_options クリーンアップ前提（インストール時に不要な残骸がないこと） -------------

test.describe('Phase 1: オプション初期状態', () => {
  test('4-1. smb_db_version オプションが保存されている', () => {
    // 有効化時に Activator::activate が呼ばれて smb_db_version が記録される.
    const snap = loadDbSnapshot();
    expect(snap.smbOptionsCount).toBeGreaterThanOrEqual(1);
  });
});
