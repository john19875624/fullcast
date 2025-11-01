// ==UserScript==
// @name         Fullcast — Google Calendar Quick Add Button
// @namespace    https://fullcast.jp/
// @version      1.0
// @description  fullcast.jp ドメインのページに常に Google カレンダー作成リンクボタンを固定表示します。ページタイトルとURLをイベントタイトル/説明に入れ、ページ内に日時が見つかれば開始日時にセットします（ISO/日本語表記などを簡易解析）。
// @match        https://fullcast.jp/*
// @match        http://fullcast.jp/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ボタンの設定
    const BUTTON_ID = 'fc-gcal-btn';
    const BUTTON_HTML = `
        <button id="${BUTTON_ID}" title="Google カレンダーに追加" aria-label="Google カレンダーに追加">
            📅 カレンダー
        </button>
    `;
    const BUTTON_STYLE_ID = 'fc-gcal-style';

    // スタイル（右下固定、小さめ）
    function injectStyle() {
        if (document.getElementById(BUTTON_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = BUTTON_STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 999999;
                background: #4285F4;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 14px;
                box-shadow: 0 6px 18px rgba(66,133,244,0.3);
                cursor: pointer;
                transition: transform .12s ease, box-shadow .12s ease;
                backdrop-filter: blur(4px);
            }
            #${BUTTON_ID}:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(66,133,244,0.35); }
            #${BUTTON_ID}:active { transform: translateY(0); }
        `;
        document.head.appendChild(style);
    }

    // Google カレンダー作成URLを組み立てる
    // 引数: オブジェクト { title, details, location, startISO, endISO }
    function buildGCalUrl({ title, details, location, startISO, endISO }) {
        const base = 'https://www.google.com/calendar/render?action=TEMPLATE';
        const params = new URLSearchParams();
        if (title) params.set('text', title);
        if (details) params.set('details', details);
        if (location) params.set('location', location);
        if (startISO) {
            // Google expects YYYYMMDDTHHMMSSZ (UTC) or local in form YYYYMMDDTHHMMSS
            // We'll try to use start/end in ISO (YYYY-MM-DDTHH:MM:SS) and convert to compact without separators.
            const s = compactGCalDate(startISO);
            if (s) {
                if (endISO) {
                    const e = compactGCalDate(endISO);
                    if (e) params.set('dates', `${s}/${e}`);
                    else params.set('dates', `${s}/${s}`);
                } else {
                    // デフォルト1時間イベント
                    const defaultEnd = addHoursISO(startISO, 1);
                    const e = compactGCalDate(defaultEnd);
                    if (e) params.set('dates', `${s}/${e}`);
                }
            }
        }
        return base + '&' + params.toString();
    }

    // ISO-ish -> Google compact format e.g. 20251101T093000Z or 20251101T093000
    function compactGCalDate(iso) {
        if (!iso) return '';
        // Try parse Date
        const d = new Date(iso);
        if (isNaN(d)) return '';
        // Use UTC format with Z to avoid timezone issues
        const pad = (n) => String(n).padStart(2, '0');
        const YYYY = d.getUTCFullYear();
        const MM = pad(d.getUTCMonth() + 1);
        const DD = pad(d.getUTCDate());
        const hh = pad(d.getUTCHours());
        const mm = pad(d.getUTCMinutes());
        const ss = pad(d.getUTCSeconds());
        return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`;
    }

    function addHoursISO(iso, hours) {
        const d = new Date(iso);
        if (isNaN(d)) return null;
        d.setHours(d.getHours() + hours);
        return d.toISOString();
    }

    // ページ内の日時を簡易抽出する（ISO, yyyy/mm/dd, yyyy年mm月dd日, 時刻を含む場合も）
    function findDateTimeFromDocument() {
        // 優先的に time[datetime] 要素を利用
        const timeEl
