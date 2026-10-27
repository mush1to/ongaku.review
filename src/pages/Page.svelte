<script lang="ts">
  import { icons } from "../config/icons";
  import { searchPath, site } from "../config/site";
  import type { PageData } from "./page-data";

  let { page }: { page: PageData } = $props();

  // Posts and later list pages belong to Home, so Home stays highlighted there.
  const sectionPath = $derived(page.kind === "home" || page.isPost ? "/" : page.path);
  // Reserve the missing rows outside the list frame so pagination stays in place.
  const emptyRowCount = $derived(
    page.kind === "home" && page.pagination
      ? Math.max(0, site.postsPerPage - (page.posts?.length ?? 0))
      : 0,
  );
  const formatDate = (date: string) => date.replaceAll("-", "/");
</script>

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
      {#if page.kind === "home"}
        <div class="list-area">
          <div class="pane">
            <table class="file-table">
              <caption class="visually-hidden">記事一覧</caption>
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
      {:else if page.kind === "search"}
        <div class="pane">
          <h1 class="pane-title">{page.title}</h1>
          <form class="search-form" action={searchPath} method="get" role="search" data-search-form>
            <label for="search-query">キーワード</label>
            <div class="search-field">
              <input id="search-query" name="q" type="search" autocomplete="off" />
              <button class="xp-button" type="submit">検索</button>
            </div>
          </form>
          <noscript><p class="search-status">検索するにはJavaScriptを有効にしてください。</p></noscript>
          <p class="search-status" role="status" data-search-status></p>
          <ul
            class="file-list"
            data-search-results
            data-search-pages={JSON.stringify(page.searchPages ?? {})}
          ></ul>
        </div>
      {:else if page.kind === "404"}
        <section class="pane not-found">
          <span class="error-number">404</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </section>
      {:else}
        <article class="pane document">
          <header class="document-header">
            <h1>{page.title}</h1>
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
          </header>
          <div class="prose">
            {@html page.body ?? ""}
          </div>
        </article>
      {/if}
    </main>

    <footer class="site-footer">
      <p>© 2026 {site.title}</p>
    </footer>
  </div>
</div>
