import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { SkeletonFeed, SkeletonCard } from '../components/SkeletonPost';
import Icon from '../components/Icon';
import { formatTime } from '../lib/dateUtils';
import { buildAvatarSrc } from '../lib/avatarUtils';
import './Explore.css';

const buildMediaSrc = (item) => {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (item.url) return item.url;
  if (item.data) {
    const safeMime = item.mime || 'image/jpeg';
    return `data:${safeMime};base64,${item.data}`;
  }
  return null;
};

const Explore = () => {
  const navigate = useNavigate();
  const { tag: urlTag } = useParams();

  const [trends, setTrends] = useState([]);
  const [filteredTrends, setFilteredTrends] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTag, setActiveTag] = useState(urlTag || null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [trendsOffset, setTrendsOffset] = useState(30);
  const [hasMoreTrends, setHasMoreTrends] = useState(true);
  const [loadingMoreTrends, setLoadingMoreTrends] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const sentinelRef = useRef(null);

  const PAGE_SIZE = 20;
  const TRENDS_PAGE_SIZE = 30;

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/social/explore/tags', { params: { limit: 30, hours: 72 } });
      const items = data.trends || [];
      setTrends(items);
      setFilteredTrends(items);
    } catch (err) {
      console.error('Erro ao carregar tendencias:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPostsByTag = useCallback(async (tag, newOffset = 0) => {
    setLoadingPosts(true);
    try {
      const { data } = await api.get(`/social/explore/tag/${encodeURIComponent(tag)}`, {
        params: { limit: PAGE_SIZE, offset: newOffset },
      });
      const items = data.posts || [];
      if (newOffset === 0) {
        setPosts(items);
      } else {
        setPosts((prev) => [...prev, ...items]);
      }
      setHasMore(items.length >= PAGE_SIZE);
      setOffset(newOffset + items.length);
    } catch (err) {
      console.error('Erro ao carregar posts por tag:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    fetchTrends();
    api.get('/social/suggestions', { params: { limit: 5 } })
      .then(({ data }) => setSuggestions((data.suggestions || []).map((u) => ({ ...u, following: false }))))
      .catch(() => {});
  }, [fetchTrends]);

  const handleFollowSuggestion = async (userId) => {
    try {
      await api.post(`/social/users/${userId}/follow`);
      setSuggestions((prev) => prev.map((u) =>
        u.id === userId ? { ...u, following: !u.following } : u
      ));
    } catch (err) {
      console.warn('Nao foi possivel atualizar sugestao de follow:', err);
    }
  };

  useEffect(() => {
    if (urlTag) {
      setActiveTag(urlTag);
      fetchPostsByTag(urlTag, 0);
    }
  }, [urlTag, fetchPostsByTag]);

  useEffect(() => {
    let filtered = trends;
    if (categoryFilter) {
      filtered = filtered.filter((t) => t.category === categoryFilter);
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
      );
    }
    setFilteredTrends(filtered);
  }, [searchFilter, trends, categoryFilter]);

  const handleTagClick = (tag) => {
    const cleanTag = tag.replace(/^#/, '');
    setActiveTag(cleanTag);
    setPosts([]);
    setOffset(0);
    navigate(`/explore/${encodeURIComponent(cleanTag)}`);
    fetchPostsByTag(cleanTag, 0);
  };

  const handleBack = () => {
    setActiveTag(null);
    setPosts([]);
    setOffset(0);
    navigate('/explore');
  };

  const loadMoreTagPosts = useCallback(() => {
    if (loadingPosts || !hasMore || !activeTag) return;
    fetchPostsByTag(activeTag, offset);
  }, [loadingPosts, hasMore, activeTag, offset, fetchPostsByTag]);

  // Infinite scroll observer for tag posts
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreTagPosts(); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreTagPosts]);

  const loadMoreTrends = async () => {
    if (loadingMoreTrends || !hasMoreTrends) return;
    setLoadingMoreTrends(true);
    try {
      const { data } = await api.get('/social/explore/tags', {
        params: { limit: TRENDS_PAGE_SIZE, offset: trendsOffset, hours: 72 },
      });
      const items = data.trends || [];
      if (items.length < TRENDS_PAGE_SIZE) setHasMoreTrends(false);
      if (items.length > 0) {
        setTrends((prev) => [...prev, ...items.filter((t) => !prev.some((e) => e.title === t.title))]);
        setTrendsOffset((prev) => prev + items.length);
      } else {
        setHasMoreTrends(false);
      }
    } catch (err) {
      console.error('Erro ao carregar mais tendencias:', err);
    } finally {
      setLoadingMoreTrends(false);
    }
  };

  const toggleLike = async (postId) => {
    try {
      const { data } = await api.post(`/social/posts/${postId}/like`);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked: data.liked, like_count: data.like_count }
            : p
        )
      );
    } catch (err) {
      console.error('Erro ao curtir:', err);
    }
  };

  const toggleRepost = async (postId) => {
    try {
      const { data } = await api.post(`/social/posts/${postId}/repost`);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, reposted: data.reposted, repost_count: data.repost_count }
            : p
        )
      );
    } catch (err) {
      console.error('Erro ao repostar:', err);
    }
  };

  const renderContentWithMentions = (content) => {
    if (!content) return null;
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="tw-mention-link">{part}</span>;
      }
      return part;
    });
  };

  const renderTags = (tags) => {
    if (!tags || !tags.length) return null;
    return (
      <div className="tw-tags">
        {tags.map((t) => (
          <span
            key={t}
            className="tw-tag"
            onClick={(e) => {
              e.stopPropagation();
              handleTagClick(t);
            }}
          >
            #{t}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="explore-page">
      <div className="explore-header">
        <h2>Explorar</h2>
      </div>

      <div className="explore-search">
        <Icon>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </Icon>
        <input
          type="text"
          placeholder="Buscar tendencias..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
      </div>

      {activeTag && (
        <>
          <button className="explore-back-btn" onClick={handleBack}>
            <Icon width="16" height="16">
              <polyline points="15 18 9 12 15 6" />
            </Icon>
            Voltar para tendencias
          </button>

          <div className="explore-tag-header">
            <h3>#{activeTag}</h3>
            <span className="tag-badge">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="explore-posts">
            {loadingPosts && posts.length === 0 && (
              <SkeletonFeed count={3} />
            )}
            {!loadingPosts && posts.length === 0 && (
              <div className="explore-empty">Nenhum post encontrado com #{activeTag}.</div>
            )}
            {posts.map((post, index) => {
              const avatarSrc = buildAvatarSrc(post.photo, post.photo_mime, post.user_id);
              return (
                <article
                  key={post.id}
                  className="tw-card feed-post"
                  style={{ animationDelay: `${index * 60}ms` }}
                  onClick={() => navigate(`/feed/${post.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/feed/${post.id}`);
                  }}
                >
                  <div className="tw-header">
                    <div
                      className="feed-avatar feed-avatar-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/${post.user_id}`);
                      }}
                    >
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={post.name || 'Perfil'} />
                      ) : (
                        <span>{(post.name || 'U')[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="feed-author">
                      <div
                        className="tw-name tw-name-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/profile/${post.user_id}`);
                        }}
                      >
                        {post.name || 'Usuario'}
                      </div>
                      <span
                        className="tw-handle tw-handle-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/profile/${post.user_id}`);
                        }}
                      >
                        @{post.username || 'usuario'}
                      </span>
                      <span className="tw-dot">.</span>
                      <span className="tw-time">{formatTime(post.created_at)}</span>
                    </div>
                  </div>

                  <div className="tw-body">
                    {post.is_article && post.title && (
                      <h3 className="tw-article-heading">{post.title}</h3>
                    )}
                    {post.is_article && <span className="tw-article-badge">Artigo</span>}
                    {renderTags(post.tags)}
                    <p className="tw-text">
                      {renderContentWithMentions(post.content?.slice(0, 300))}
                      {post.content?.length > 300 ? '...' : ''}
                    </p>
                    {post.media && post.media.length > 0 && (
                      <div
                        className={`feed-media ${
                          post.media.length > 1 ? 'feed-media-grid' : ''
                        }`}
                      >
                        {post.media.map((item, idx) => {
                          const mediaSrc = buildMediaSrc(item);
                          if (!mediaSrc) return null;
                          return (
                            <img
                              key={`${post.id}-media-${idx}`}
                              src={mediaSrc}
                              alt={`Midia ${idx + 1}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="tw-actions">
                    <button
                      className="tw-action"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/feed/${post.id}`);
                      }}
                    >
                      <Icon>
                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      </Icon>
                      <span>{post.comment_count || 0}</span>
                    </button>
                    <button
                      className={`tw-action ${post.reposted ? 'reposted' : ''}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRepost(post.id);
                      }}
                      title={post.reposted ? 'Desfazer repost' : 'Repostar'}
                    >
                      <Icon>
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </Icon>
                      <span>{post.repost_count || 0}</span>
                    </button>
                    <button
                      className={`tw-action ${post.liked ? 'liked' : ''}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(post.id);
                      }}
                    >
                      <Icon>
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
                      </Icon>
                      <span>{post.like_count || 0}</span>
                    </button>
                    <button
                      className="tw-action"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard?.writeText(
                          `${window.location.origin}/feed/${post.id}`
                        );
                      }}
                      title="Compartilhar"
                    >
                      <Icon>
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </Icon>
                    </button>
                  </div>
                </article>
              );
            })}
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            {loadingPosts && posts.length > 0 && (
              <SkeletonFeed count={2} />
            )}
          </div>
        </>
      )}

      {!activeTag && (
        <>
          {suggestions.length > 0 && (
            <div className="explore-suggestions">
              <h3 className="explore-section-title">Quem seguir</h3>
              <div className="explore-suggestions-list">
                {suggestions.map((u) => {
                  const src = buildAvatarSrc(u.photo, u.photo_mime, u.id);
                  return (
                    <div key={u.id} className="explore-suggestion-item">
                      <div className="explore-suggestion-avatar" onClick={() => navigate(`/profile/${u.id}`)}>
                        {src ? <img src={src} alt={u.name} /> : <span>{(u.name || 'U')[0]?.toUpperCase()}</span>}
                      </div>
                      <div className="explore-suggestion-info" onClick={() => navigate(`/profile/${u.id}`)}>
                        <strong>{u.name}</strong>
                        {u.username && <span className="explore-suggestion-handle">@{u.username}</span>}
                      </div>
                      <button
                        className={`explore-follow-btn ${u.following ? 'following' : ''}`}
                        onClick={() => handleFollowSuggestion(u.id)}
                      >
                        {u.following ? 'Seguindo' : 'Seguir'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="explore-category-tabs">
            {[
              { key: null, label: 'Todos' },
              { key: 'Hashtag', label: 'Hashtags' },
              { key: 'Assunto do Momento', label: 'Assuntos' },
            ].map(({ key, label }) => (
              <button
                key={label}
                className={`explore-category-tab ${categoryFilter === key ? 'active' : ''}`}
                onClick={() => setCategoryFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {loading && (
            <div className="explore-tags-grid">
              {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
            </div>
          )}
          {!loading && filteredTrends.length === 0 && (
            <div className="explore-empty">Nenhuma tendencia encontrada.</div>
          )}
          <div className="explore-tags-grid">
            {filteredTrends.map((topic, index) => (
              <div
                key={`${topic.title}-${index}`}
                className="explore-tag-card"
                onClick={() => handleTagClick(topic.title)}
              >
                <span className="tag-category">{topic.category}</span>
                <strong className="tag-title">#{topic.title}</strong>
                {topic.count > 0 && (
                  <span className="tag-count">{topic.count} posts</span>
                )}
              </div>
            ))}
          </div>
          {hasMoreTrends && !searchFilter.trim() && (
            <button
              className="explore-load-more"
              onClick={loadMoreTrends}
              disabled={loadingMoreTrends}
            >
              {loadingMoreTrends ? 'Carregando...' : 'Carregar mais tendencias'}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default Explore;
