# Product

## Register

product

## Users

慈濟（Tzu Chi）內部同仁，分兩群：

- **非工程背景的承辦人**：負責每次活動 / 法會 / 會議的簡報排程。會 Google Docs、會貼網址、但不會 console，會被英文錯誤訊息嚇到。**主要使用情境是「上台前 10 分鐘要把今天要播的幾份 doc 兜成一個 playlist」**——時間壓力大、容錯空間小、不能讓他在「載入失敗」前面卡住。
- **有電腦背景的同仁**：協助維運、會處理「為什麼 doc 沒同步」這類問題。接受多一點 tech-aware 的 UI（doc_id、JSON-ish 的錯誤訊息），但只是次要族群。

兩群人都不是「每天用」——更像每月、每季、每次大型活動才回來，所以**任何流程都不能依賴肌肉記憶**，必須一眼看懂。

## Product Purpose

把 Google Docs 轉成可投影、可遠端操控的縱式中文簡報，給法會 / 講座 / 內部會議使用。Admin 是這套系統的後台：管理已上架的 doc、編 playlist、控制公開狀態。**Admin 不是給觀眾看的、不需要行銷感**——它是一個工作台，目標是讓承辦人在最短時間內把今天要播的東西配置好，不會在過程中弄丟資料、也不會誤刪別人東西。

成功狀態：

- 三分鐘內可以匯入一份 doc、加進 playlist、設為公開、開始播放
- 任何「不可逆」動作（刪 doc、清 playlist）都有明確警告與後果說明
- 視覺上一看就知道「這是慈濟的工具」，不是隨便撿一個開源 admin 套版

## Brand Personality

**端莊、克制、人本**（Dignified, restrained, humane）。

- **語氣**：像辦公室裡那位細心的師姐——把事情交代清楚、不急、不浮誇，但也不會故意端架子。錯誤訊息用「請」、不用 emoji 撒嬌、不用「Oops!」這種逗趣口吻。
- **色彩 anchor**：慈濟藍（depending on context 約 OKLCH 65% L、0.07-0.09 C、240-250° H）+ 米白 / 木色系。藍是身份識別、不是裝飾；其他位置用克制的中性色與木色暖調。
- **字體**：中文偏標楷體 / DFKai-SB（呼應現有 viewer 字體）作為標題，正文用 sans 即可，不要強迫所有文字都楷體（會難讀）。
- **節奏**：低資訊密度、留白多、動效少而精——hover / focus 用得到，section 進場動畫不需要。

## Anti-references

明確排除以下方向：

- **Corporate-tech**：藍黃漸層 hero、炸開的網狀背景、scroll-driven 動畫、3D 渲染裝飾——慈濟是人道團體，不是初創 SaaS。
- **古董政府網站**：心型 icon、3D 浮雕按鈕、霓虹色清單、Comic Sans / 微軟正黑體粗體當標題——避免看起來像 2008 年的政府服務台。
- **過度佛教元素**：蓮花 watermark、佛像剪影、佛經字體拿來當裝飾字、金色 / 紫色法會配色——這是內部工作台，不是法會手冊。Buddhist values 透過克制與秩序體現，不透過符號。
- **Notion / Linear 風克隆**：通用 SaaS 的純白 + 一抹藍 + Inter 字體——技術上沒問題、但讀不出慈濟的身份。要可辨識。
- **目前的 dark slate**：`#0f1419` 暗藍底是工程師習慣的暫時樣式，不是品牌——當前 admin 的視覺需要 reset。

## Design Principles

1. **慈濟身份識別優先於通用 SaaS 慣例**。Admin 看起來必須是「慈濟的工具」、不是「任何一家公司的 admin」。任何視覺決定卡在「酷 vs 像慈濟」時，選後者。
2. **端莊優於酷炫**。沒有 tricks。沒有 floating particles。沒有 gradient text。克制的顏色、清楚的排版、誠實的狀態。慈濟人看到要覺得「這個工具是認真做的」，而不是「這個工具很潮」。
3. **不可逆動作必須有摩擦**。刪 doc、清 playlist、改公開狀態——任何會影響別人能看到什麼的動作，都要有確認 + 後果說明（例：「會同步從 X 個 playlist 移除」）。Admin 沒有 auth，誰拿到 URL 都能操作；摩擦是唯一一層 sanity check。
4. **狀態一眼可讀**。是否公開、是否在 playlist、是否需要 re-sync——這些核心狀態必須在 list view 就看得到，不能要點進去才知道。
5. **隱形宗教感**。Buddhist values（慈悲、莊重、利他）透過 restraint 表現：少花俏、多留白、字體選擇有意識、錯誤訊息有體溫——而非把蓮花圖案塞進 logo。

## Accessibility & Inclusion

- **目標：WCAG 2.1 AA**。內文 ≥ 4.5:1 對比、大字 ≥ 3:1、focus ring 可見、Tab 順序符合視覺順序、互動元件 ≥ 24×24px 觸控區。
- **不額外升 AAA**：使用者不包含視障群體；不為了極端 screen reader 體驗犧牲視覺密度。
- **`prefers-reduced-motion`**：所有 transition / animation 都要有 fallback（直接淡入 / 直接顯示）。
- **語系**：UI 是繁體中文為主、保留少數英文技術詞（doc_id, playlist, OAuth）。不需 i18n 切換。
- **字體 fallback**：標楷體在 macOS / Windows 安裝率高但 mobile 不一定有——所有中文字體 stack 都需要 sans-serif fallback，不能在缺字時 fallback 到 Times New Roman。
