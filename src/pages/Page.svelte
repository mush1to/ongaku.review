<script lang="ts">
  import { icons } from "../config/icons";
  import { site } from "../config/site";
  import { tagRoutePath } from "../utils/search-path";
  import type { PageData } from "./page-data";

  let { page }: { page: PageData } = $props();

  // Posts, tag pages, and later list pages belong to Home.
  const sectionPath = $derived(
    page.kind === "home" || page.kind === "tag" || page.isPost ? "/" : page.path,
  );
  // Reserve the missing rows outside the list frame so pagination stays in place.
  const emptyRowCount = $derived(
    page.kind === "home" && page.pagination
      ? Math.max(0, site.postsPerPage - (page.posts?.length ?? 0))
      : 0,
  );
  const formatDate = (date: string) => date.replaceAll("-", "/");
  const shareUrl = $derived(
    "https://x.com/intent/post?" +
      new URLSearchParams({ text: page.title, url: site.url + page.path }).toString(),
  );
</script>

{#snippet xLogo()}
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="#000"
      d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
    />
  </svg>
{/snippet}

<a class="skip-link" href="#main">本文へスキップ</a>
<div class="window">
  <div class="title-bar" aria-hidden="true">
    <img class="title-bar-icon" src={icons.world} alt="" width="16" height="16" />
    <span class="title-bar-text">Internet</span>
    <span class="title-bar-controls">
      <span class="title-bar-button title-bar-minimize"></span>
      <span class="title-bar-button title-bar-restore"></span>
      <span class="title-bar-button title-bar-close"></span>
    </span>
  </div>
  <header class="window-header">
    <div class="site-identity">
      {#if page.kind === "home"}
        <h1 class="site-title"><a href="/">{site.title}</a></h1>
      {:else}
        <p class="site-title"><a href="/">{site.title}</a></p>
      {/if}
      <p class="site-description">{site.description}</p>
    </div>
    <nav class="main-nav" aria-label="メインナビゲーション">
      <ul>
        {#each site.navigation as link (link.path)}
          <li>
            <a
              href={link.path}
              aria-current={link.path === page.path
                ? "page"
                : link.path === sectionPath
                  ? "true"
                  : undefined}
            >
              <img src={icons[link.icon]} alt="" width="32" height="32" />
              <span>{link.label}</span>
            </a>
          </li>
        {/each}
        <li>
          <button type="button" aria-haspopup="dialog" aria-controls="search-window" data-search-open>
            <img src={icons.magnifier} alt="" width="32" height="32" />
            <span>Search</span>
          </button>
        </li>
      </ul>
    </nav>
  </header>

  <div class="window-body">
    <nav class="address-bar" aria-label="現在地">
      <a class="address-home" href="/" aria-label="ホーム">
        <img src={icons.folder} alt="" width="24" height="24" />
      </a>
      {#if page.breadcrumbs.length > 0}
        <span class="address-root" aria-hidden="true">/</span>
        <ol>
          {#each page.breadcrumbs as crumb, index (index)}
            <li>
              {#if crumb.path}
                <a href={crumb.path}>{crumb.label}</a>
              {:else}
                <span aria-current="page">{crumb.label}</span>
              {/if}
            </li>
          {/each}
        </ol>
      {:else}
        <span class="address-root" aria-current="page">/</span>
      {/if}
    </nav>

    <main id="main">
      {#if page.kind === "tag"}
        <h1 class="visually-hidden">{page.title}</h1>
      {/if}
      {#if page.kind === "home" || page.kind === "tag"}
        <div class="list-area">
          <div class="pane">
            <table class="file-table">
              <caption class="visually-hidden">
                {page.kind === "tag" ? `タグ「#${page.tag}」の記事` : "記事一覧"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">名前</th>
                  <th scope="col" aria-sort="descending">作成日時</th>
                </tr>
              </thead>
              <tbody>
                {#each page.posts ?? [] as post (post.path)}
                  <tr>
                    <td>
                      <a class="file-link" href={post.path}>
                        <img src={icons[post.icon]} alt="" width="24" height="24" />
                        <span>{post.title}</span>
                      </a>
                    </td>
                    <td class="file-date">
                      {#if post.created}
                        <time datetime={post.created}>{formatDate(post.created)}</time>
                      {/if}
                    </td>
                  </tr>
                {:else}
                  <tr>
                    <td class="file-empty" colspan="2">まだ記事がありません。</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if emptyRowCount > 0}
            <div class="pane-spacer" style="--empty-rows: {emptyRowCount}" aria-hidden="true"></div>
          {/if}
        </div>
        {#if page.pagination}
          <nav class="pagination" aria-label="ページ送り">
            <ul>
              <li>
                {#if page.pagination.previous}
                  <a href={page.pagination.previous} rel="prev">&lt; 前へ</a>
                {:else}
                  <span aria-disabled="true">&lt; 前へ</span>
                {/if}
              </li>
              {#each page.pagination.pages as item (item.number)}
                <li>
                  <a
                    href={item.path}
                    aria-current={item.number === page.pagination.current ? "page" : undefined}
                  >
                    {item.number}
                  </a>
                </li>
              {/each}
              <li>
                {#if page.pagination.next}
                  <a href={page.pagination.next} rel="next">次へ &gt;</a>
                {:else}
                  <span aria-disabled="true">次へ &gt;</span>
                {/if}
              </li>
            </ul>
          </nav>
        {/if}
      {:else if page.kind === "404"}
        <section class="pane not-found">
          <span class="error-number">404</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </section>
      {:else}
        <article class="pane document">
          <header class="document-header">
            {#if page.thumbnail}
              <figure class="document-thumbnail">
                <img src={page.thumbnail.src} alt="" width="1200" height="630" />
              </figure>
            {/if}
            <h1>{page.title}</h1>
            {#snippet dates()}
              {#if page.created}
                <p class="document-date">
                  <span class="document-date-label">作成日時</span>
                  <time datetime={page.created}>{formatDate(page.created)}</time>
                </p>
              {/if}
              {#if page.updated}
                <p class="document-date">
                  <span class="document-date-label">更新日時</span>
                  <time datetime={page.updated}>{formatDate(page.updated)}</time>
                </p>
              {/if}
            {/snippet}
            {#if page.author}
              <div class="document-byline">
                <img
                  class="user-icon"
                  src={page.author.icon ?? icons.user}
                  alt=""
                  width="32"
                  height="32"
                />
                <div class="document-byline-text">
                  <p class="document-author">{page.author.name}</p>
                  <div class="document-dates">{@render dates()}</div>
                </div>
              </div>
            {:else}
              {@render dates()}
            {/if}
          </header>
          <div class="prose">
            {@html page.body ?? ""}
          </div>
          {#if page.isPost}
            <footer class="document-footer">
              {#if page.tags?.length}
                <ul class="document-tags" aria-label="タグ">
                  {#each page.tags as tag (tag)}
                    <li><a href={tagRoutePath(tag)}>#{tag}</a></li>
                  {/each}
                </ul>
              {/if}
              <a
                class="xp-button share-button"
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Xでポスト"
              >
                {@render xLogo()}
                <span>ポスト</span>
              </a>
              {#if page.author}
                <section class="author-card" aria-labelledby="author-card-title">
                  <h2 class="author-card-title" id="author-card-title">この記事を書いた人</h2>
                  <div class="author-card-body">
                    <img
                      class="user-icon"
                      src={page.author.icon ?? icons.user}
                      alt=""
                      width="64"
                      height="64"
                    />
                    <div class="author-card-text">
                      <p class="author-card-name">{page.author.name}</p>
                      {#if page.author.description}
                        <p class="author-card-description">{page.author.description}</p>
                      {/if}
                      {#if page.author.links.length}
                        <ul class="author-links" aria-label="{page.author.name}のリンク">
                          {#each page.author.links as link, index (index)}
                            <li>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={link.label}
                                title={link.label}
                              >
                                {#if link.kind === "x"}
                                  {@render xLogo()}
                                {:else}
                                  <img src={icons.world} alt="" width="16" height="16" />
                                {/if}
                              </a>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                  </div>
                </section>
              {/if}
            </footer>
          {/if}
        </article>
        {#if page.adjacent && (page.adjacent.previous || page.adjacent.next)}
          <nav class="adjacent-posts" aria-label="前後の記事">
            {#if page.adjacent.previous}
              <a class="adjacent-link adjacent-previous" href={page.adjacent.previous.path} rel="prev">
                <span class="adjacent-label">&lt; 前の記事</span>
                <span class="adjacent-title">
                  <img src={icons[page.adjacent.previous.icon]} alt="" width="24" height="24" />
                  <span>{page.adjacent.previous.title}</span>
                </span>
              </a>
            {/if}
            {#if page.adjacent.next}
              <a class="adjacent-link adjacent-next" href={page.adjacent.next.path} rel="next">
                <span class="adjacent-label">次の記事 &gt;</span>
                <span class="adjacent-title">
                  <img src={icons[page.adjacent.next.icon]} alt="" width="24" height="24" />
                  <span>{page.adjacent.next.title}</span>
                </span>
              </a>
            {/if}
          </nav>
        {/if}
      {/if}
    </main>

    <footer class="site-footer">
      <p>© 2026 {site.title}</p>
    </footer>
  </div>
</div>
<dialog
  class="search-window"
  id="search-window"
  aria-labelledby="search-window-title"
  data-search-window
>
  <div class="search-window-frame">
    <div class="title-bar">
      <img class="title-bar-icon" src={icons.magnifier} alt="" width="16" height="16" />
      <h2 class="title-bar-text" id="search-window-title">検索</h2>
      <button class="search-window-close" type="button" aria-label="閉じる" data-search-close>
        <span class="title-bar-button title-bar-close"></span>
      </button>
    </div>
    <div class="search-window-body">
      <form class="search-form" role="search" data-search-form>
        <label for="search-query">キーワード</label>
        <div class="search-field">
          <input id="search-query" name="q" type="search" autocomplete="off" />
          <button class="xp-button" type="submit">検索</button>
        </div>
      </form>
      <p class="search-status" role="status" data-search-status></p>
      <ul class="file-list search-results" data-search-results></ul>
    </div>
  </div>
</dialog>
