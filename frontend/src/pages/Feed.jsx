import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import MarkdownRenderer from '../components/chat/MarkdownRenderer';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import { SkeletonFeed } from '../components/SkeletonPost';
import SigsHeader from '../components/SigsHeader';
import './Feed.css';
import Icon from '../components/Icon';
import { parseDate, formatTime } from '../lib/dateUtils';
import { buildAvatarSrc, buildMediaSrc } from '../lib/avatarUtils';

const URL_REGEX = /https?:\/\/[^\s<]+/g;

const LinkPreview = ({ url }) => {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    api.get('/social/link-preview', { params: { url } })
      .then(({ data }) => { if (!cancelled && data.title) setMeta(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  if (!meta) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="tw-link-preview" onClick={(e) => e.stopPropagation()}>
      {meta.image && <img src={meta.image} alt="" className="tw-link-preview-img" />}
      <div className="tw-link-preview-body">
        <strong>{meta.title}</strong>
        {meta.description && <p>{meta.description.slice(0, 120)}</p>}
        <span>{new URL(url).hostname}</span>
      </div>
    </a>
  );
};

const PollDisplay = ({ postId }) => {
    const [poll, setPoll] = useState(null);
    const [animating, setAnimating] = useState(false);
    useEffect(() => {
        api.get(`/social/posts/${postId}/poll`).then(({ data }) => setPoll(data.poll)).catch(() => {});
    }, [postId]);
    if (!poll) return null;
    const hasVoted = poll.user_vote !== null;
    const handleVote = async (optionId) => {
        try {
            const { data } = await api.post(`/social/polls/${poll.id}/vote`, { option_id: optionId });
            setAnimating(true);
            setPoll(data.poll);
            setTimeout(() => setAnimating(false), 600);
        } catch (err) { console.error('Erro ao votar:', err); }
    };
    return (
        <div className="tw-poll" onClick={e => e.stopPropagation()}>
            <strong className="tw-poll-title">{poll.question}</strong>
            <div className="tw-poll-options">
                {poll.options.map(opt => (
                    <button key={opt.id} type="button" className={`tw-poll-opt ${poll.user_vote === opt.id ? 'voted' : ''} ${hasVoted || poll.expired ? 'show-results' : ''} ${animating ? 'animating' : ''}`} onClick={e => { e.stopPropagation(); if (!hasVoted && !poll.expired) handleVote(opt.id); }} disabled={poll.expired && !hasVoted}>
                        <span className="tw-poll-opt-text">{opt.text}</span>
                        {(hasVoted || poll.expired) && (
                            <>
                                <span className="tw-poll-opt-pct">{opt.percentage}%</span>
                                <div className="tw-poll-opt-bar" style={{ width: animating ? '0%' : `${opt.percentage}%`, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                            </>
                        )}
                    </button>
                ))}
            </div>
            <span className="tw-poll-meta">{poll.total_votes} votos{poll.expired ? ' · Encerrada' : ''}</span>
        </div>
    );
};

const QuotedPostEmbed = ({ post, quotedPostId, navigate }) => {
  const [quoted, setQuoted] = useState(post || null);
  useEffect(() => {
    if (post) { setQuoted(post); return; }
    if (!quotedPostId) return;
    let cancelled = false;
    api.get(`/social/posts/${quotedPostId}`).then(({ data }) => {
      if (!cancelled && data.post) setQuoted(data.post);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [quotedPostId, post]);
  if (!quoted) return null;
  const avatarSrc = buildAvatarSrc(quoted.photo, quoted.photo_mime, quoted.user_id);
  return (
    <div className="tw-quoted-post" onClick={e => { e.stopPropagation(); navigate(`/feed/${quoted.id}`); }}>
      <div className="tw-quoted-header">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
        ) : null}
        <strong>{quoted.name}</strong>
        <span>@{quoted.username}</span>
      </div>
      {quoted.title && <strong style={{ fontSize: '0.85rem', color: '#e7e7ea', display: 'block', marginBottom: 2 }}>{quoted.title}</strong>}
      <p>{quoted.content?.slice(0, 200)}{quoted.content?.length > 200 ? '...' : ''}</p>
    </div>
  );
};

const Feed = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { postId, userId: profileUserId } = useParams();
  const [sigsTab, setSigsTab] = useState('feed');
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [replyOpen, setReplyOpen] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const composerRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [, setSearchActive] = useState(false);
  const [searchFilters] = useState({ date_from: '', date_to: '', content_type: '', author: '' });
  const [focusedPostId, setFocusedPostId] = useState(null);
  const [focusedPostData, setFocusedPostData] = useState(null);
  const [feedMode, setFeedMode] = useState('recommended');
  const [feedCache, setFeedCache] = useState({ recommended: null, all: null, following: null, trending: null });
  const [nextCursor, setNextCursor] = useState(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const feedTimestampRef = useRef(null);
  const [commentSort, setCommentSort] = useState('recent');
  const [isArticleMode, setIsArticleMode] = useState(false);
  const [articleTitle, setArticleTitle] = useState('');
  const [isPollMode, setIsPollMode] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollExpires, setPollExpires] = useState(24);
  const [editingPost, setEditingPost] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreErrorCount = useRef(0);
  const scrollSentinelRef = useRef(null);
  const [profileData, setProfileData] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [blockMuteStatus, setBlockMuteStatus] = useState({});
  const [quotingPost, setQuotingPost] = useState(null);
  const [repostMenuFor, setRepostMenuFor] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null, variant: 'danger' });
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const draftRef = useRef(null);

  // Share, lightbox, thread, translation, typing
  const [shareToast, setShareToast] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { images: [], index: 0 }
  const typingTimeoutRef = useRef({});

  // Engagement features
  const [streak, setStreak] = useState(null);
  const [postOfWeek, setPostOfWeek] = useState(null);
  const [reactions, setReactions] = useState({}); // { postId: { reaction: { count, user_reacted } } }
  const [reactMenuFor, setReactMenuFor] = useState(null);

  const [isFirstTime, setIsFirstTime] = useState(false); // true if user has zero posts ever

  // Scheduling


  // Hashtag feed
  const [hashtagFilter, setHashtagFilter] = useState(null);

  // Scroll progress
  const [scrollProgress, setScrollProgress] = useState(0);

  // Double-tap like
  const lastTapRef = useRef({});
  const [doubleTapHeart, setDoubleTapHeart] = useState(null);

  // Comment/reply mention autocomplete
  const [cmtMentionKey, setCmtMentionKey] = useState(null); // postId or 'postId:commentId'
  const [cmtMentionQuery, setCmtMentionQuery] = useState('');
  const [cmtMentionResults, setCmtMentionResults] = useState([]);
  const [cmtMentionIndex, setCmtMentionIndex] = useState(0);
  const cmtMentionRefs = useRef({});


  const displayedPosts = useMemo(() => {
    return posts;
  }, [posts]);
  const focusedPost = focusedPostData;

  const emojis = ['😀', '😁', '😂', '😍', '😎', '🤝', '✅', '🔥'];

  const renderTags = (tags) => {
    if (!tags || !tags.length) return null;
    return (
      <div className="tw-tags">
        {tags.map((tag) => (
          <span key={tag} className={`tw-tag ${hashtagFilter === tag ? 'active' : ''}`} onClick={(e) => {
            e.stopPropagation();
            if (hashtagFilter === tag) {
              setHashtagFilter(null);
              setSearchActive(false);
              setSearchTerm('');
            } else {
              setHashtagFilter(tag);
            }
          }}>#{tag}</span>
        ))}
      </div>
    );
  };

  const placeholderName = useMemo(() => {
    const name = localStorage.getItem('user_name') || 'Usuario';
    return name.length ? name : 'Usuario';
  }, [feedMode]);

  const COMPOSER_PROMPTS = [
    'O que esta acontecendo?',
    'Compartilhe uma dica de engenharia...',
    'Qual projeto voce esta trabalhando?',
    'Tem alguma duvida tecnica?',
    'Compartilhe algo que aprendeu hoje...',
    'O que te inspirou recentemente?',
    'Qual ferramenta voce recomenda?',
    'Conte sobre um desafio que superou...',
  ];
  const composerPlaceholder = useMemo(() => {
    if (isArticleMode) return 'Escreva seu artigo tecnico... (suporta Markdown: **negrito**, ## titulos, - listas, ```codigo```)';
    return COMPOSER_PROMPTS[Math.floor(Math.random() * COMPOSER_PROMPTS.length)];
  }, [isArticleMode, feedMode]);

  const PAGE_SIZE = 20;

  const fetchFeed = async () => {
    const cached = feedCache[feedMode];
    if (cached) {
      // Stale-while-revalidate: mostra cache imediatamente, re-fetch em background
      setPosts(cached.posts);
      setNextCursor(cached.cursor);
      setHasMore(!!cached.cursor);
      setLoading(false);
      // Revalidate silenciosamente
      api.get('/social/feed', { params: { mode: feedMode, limit: PAGE_SIZE } }).then(({ data }) => {
        const items = data.posts || [];
        const cursor = data.next_cursor || null;
        setPosts(items);
        setNextCursor(cursor);
        setHasMore(!!cursor);
        if (items.length > 0) feedTimestampRef.current = items[0].created_at;
        setFeedCache((current) => ({ ...current, [feedMode]: { posts: items, cursor } }));
      }).catch(() => {});
      return;
    }
    try {
      const { data } = await api.get('/social/feed', { params: { mode: feedMode, limit: PAGE_SIZE } });
      const items = data.posts || [];
      const cursor = data.next_cursor || null;
      setPosts(items);
      setNextCursor(cursor);
      setHasMore(!!cursor);
      setNewPostsCount(0);
      if (items.length > 0) {
        feedTimestampRef.current = items[0].created_at;
      } else {
        feedTimestampRef.current = new Date().toISOString();
      }
      setFeedCache((current) => ({ ...current, [feedMode]: { posts: items, cursor } }));
    } catch (err) {
      console.error('Erro ao carregar feed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMorePosts = async () => {
    if (loadingMore || !hasMore || focusedPostId) return;
    if (loadMoreErrorCount.current >= 3) return; // Stop after 3 consecutive errors
    setLoadingMore(true);
    try {
      const params = { mode: feedMode, limit: PAGE_SIZE };
      if (nextCursor) {
        params.cursor_created_at = nextCursor.created_at;
        params.cursor_id = nextCursor.id;
      } else {
        params.offset = posts.length;
      }
      const { data } = await api.get('/social/feed', { params });
      loadMoreErrorCount.current = 0; // Reset on success
      const items = data.posts || [];
      const cursor = data.next_cursor || null;
      setNextCursor(cursor);
      if (!cursor) setHasMore(false);
      if (items.length > 0) {
        setPosts((current) => {
          const ids = new Set(current.map((p) => p.id));
          const newItems = items.filter((p) => !ids.has(p.id));
          return [...current, ...newItems];
        });
        // Invalida só o modo atual (dados parciais após paginação)
        setFeedCache((prev) => ({ ...prev, [feedMode]: null }));
      }
    } catch (err) {
      loadMoreErrorCount.current += 1;
      console.error('Erro ao carregar mais posts:', err);
      if (loadMoreErrorCount.current >= 3) {
        setHasMore(false); // Stop infinite scroll after repeated failures
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const { data } = await api.get('/social/suggestions');
      const items = (data.suggestions || []).map((item) => ({
        ...item,
        following: false,
      }));
      setSuggestions(items);
    } catch (err) {
      console.error('Erro ao carregar sugestoes:', err);
    }
  };

  useEffect(() => {
    fetchSuggestions();
    api.get('/auth/me').then(({ data }) => {
      setCurrentUser(data);
      if (data?.id) {
        api.get(`/social/users/${data.id}/posts`).then(({ data: pData }) => {
          setIsFirstTime(!pData.posts || pData.posts.length === 0);
        }).catch(() => {});
      }
    }).catch(() => {});
    api.get('/social/streak').then(({ data }) => setStreak(data)).catch(() => {});
    api.get('/social/post-of-week').then(({ data }) => setPostOfWeek(data.post)).catch(() => {});
    try {
      const saved = JSON.parse(localStorage.getItem('feed_recent_searches') || '[]');
      if (Array.isArray(saved)) setRecentSearches(saved);
    } catch (err) {
      console.warn('Nao foi possivel carregar buscas recentes do feed:', err);
    }
  }, []);

  useEffect(() => {
    setHasMore(true);
    setNewPostsCount(0);
    loadMoreErrorCount.current = 0;
    fetchFeed();
  }, [feedMode]);

  // Nav-reset: recarregar feed ao clicar em "Página Inicial" estando já no /feed
  useEffect(() => {
    const handleNavReset = async () => {
      setFeedCache({});
      setNewPostsCount(0);
      setLoading(true);
      loadMoreErrorCount.current = 0;
      try {
        const { data } = await api.get('/social/feed', { params: { mode: feedMode, limit: PAGE_SIZE } });
        const items = data.posts || [];
        const cursor = data.next_cursor || null;
        setPosts(items);
        setNextCursor(cursor);
        setHasMore(!!cursor);
        if (items.length > 0) feedTimestampRef.current = items[0].created_at;
        setFeedCache((current) => ({ ...current, [feedMode]: { posts: items, cursor } }));
      } catch (err) {
        console.error('Erro ao recarregar feed:', err);
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener('nav-reset', handleNavReset);
    return () => window.removeEventListener('nav-reset', handleNavReset);
  }, [feedMode]);

  // Polling: verifica novos posts a cada 30s
  useEffect(() => {
    if (feedMode === 'trending' || feedMode === 'recommended') return;
    const interval = setInterval(async () => {
      if (!feedTimestampRef.current || focusedPostId) return;
      try {
        const { data } = await api.get('/social/feed/new-count', {
          params: { since: feedTimestampRef.current, mode: feedMode },
        });
        if (data.count > 0) setNewPostsCount(data.count);
      } catch (err) {
        console.warn('Erro ao verificar novos posts do feed:', err);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [feedMode, focusedPostId]);

  const loadNewPosts = () => {
    setNewPostsCount(0);
    setFeedCache((prev) => ({ ...prev, [feedMode]: null }));
    setLoading(true);
    fetchFeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Draft auto-save to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('feed_draft');
    if (saved && !draft) setDraft(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (draft) {
      localStorage.setItem('feed_draft', draft);
    } else {
      localStorage.removeItem('feed_draft');
    }
  }, [draft]);

  // Scroll progress indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Hashtag feed filter
  useEffect(() => {
    if (!hashtagFilter) return;
    setSearchActive(true);
    setSearchTerm(`#${hashtagFilter}`);
    api.get('/social/search', { params: { q: `#${hashtagFilter}`, mode: feedMode, limit: 40 } })
      .then(({ data }) => setSearchResults(data.posts || []))
      .catch(() => setSearchResults([]));
  }, [hashtagFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Double-tap to like handler
  const handleDoubleTap = useCallback((postId) => {
    const now = Date.now();
    const lastTap = lastTapRef.current[postId] || 0;
    if (now - lastTap < 300) {
      // Double tap detected
      const post = posts.find(p => p.id === postId) || focusedPostData;
      if (post && !post.liked) {
        toggleLike(postId);
      }
      setDoubleTapHeart(postId);
      setTimeout(() => setDoubleTapHeart(null), 800);
      lastTapRef.current[postId] = 0;
    } else {
      lastTapRef.current[postId] = now;
    }
  }, [posts, focusedPostData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading time helper
  const getReadingTime = (content) => {
    if (!content) return 0;
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  };

  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMorePosts();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [posts.length, hasMore, loadingMore, feedMode, focusedPostId]);

  useEffect(() => {
    if (!profileUserId) {
      setProfileData(null);
      setProfilePosts([]);
      return;
    }
    const uid = Number(profileUserId);
    if (Number.isNaN(uid)) return;
    api.get(`/social/users/${uid}/profile`).then(({ data }) => setProfileData(data.profile)).catch(() => setProfileData(null));
    api.get(`/social/users/${uid}/posts`).then(({ data }) => setProfilePosts(data.posts || [])).catch(() => setProfilePosts([]));
    api.get(`/social/users/${uid}/block-mute`).then(({ data }) => setBlockMuteStatus(data)).catch(() => {});
  }, [profileUserId]);

  useEffect(() => {
    if (!postId) {
      setFocusedPostId(null);
      setFocusedPostData(null);
      return;
    }
    const parsed = Number(postId);
    if (!Number.isNaN(parsed)) {
      setFocusedPostId(parsed);
    }
  }, [postId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.feed-menu')) {
        setMenuOpenFor(null);
      }
      if (!event.target.closest('.feed-emoji')) {
        setEmojiOpen(false);
      }
      if (!event.target.closest('.feed-search')) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  useEffect(() => {
    if (!focusedPostId) return;
    const inList = displayedPosts.find((post) => post.id === focusedPostId);
    if (inList) {
      setFocusedPostData(inList);
      return;
    }
    api
      .get(`/social/posts/${focusedPostId}`)
      .then(({ data }) => setFocusedPostData(data.post))
      .catch(() => setFocusedPostData(null));
  }, [focusedPostId, displayedPosts]);

  useEffect(() => {
    if (!focusedPostId) {
      setOpenComments({});
      return;
    }
    setOpenComments((current) => ({ ...current, [focusedPostId]: true }));
    loadCommentsForPost(focusedPostId);
  }, [focusedPostId]);

  const handlePost = async () => {
    if (isPollMode) {
      const validOptions = pollOptions.filter(o => o.trim());
      if (!pollQuestion.trim() || validOptions.length < 2) return;
      setPosting(true);
      try {
        const { data } = await api.post('/social/polls', {
          content: draft || pollQuestion,
          question: pollQuestion,
          options: validOptions,
          expires_hours: pollExpires,
        });
        if (data?.post) {
          setPosts(current => [data.post, ...current]);
          setDraft(''); setPollQuestion(''); setPollOptions(['', '']); setIsPollMode(false);
          setFeedCache({ recommended: null, all: null, following: null, trending: null });
        }
      } catch (err) {
        console.error('Erro ao criar enquete:', err);
        toast.error(err?.response?.data?.detail || 'Erro ao criar enquete.');
      } finally {
        setPosting(false);
      }
      return;
    }
    if (!draft.trim() || posting) return;
    if (isArticleMode && !articleTitle.trim()) return;
    setPosting(true);
    try {
      const payload = { content: draft, media: attachments };
      if (isArticleMode && articleTitle.trim()) {
        payload.title = articleTitle.trim();
      }
      if (quotingPost) {
        payload.quoted_post_id = quotingPost.id;
      }
      const { data } = await api.post('/social/posts', payload);
      if (data?.post) {
        setPosts((current) => [data.post, ...current]);
        setIsFirstTime(false);
        toast.success('Post publicado!');
        setDraft('');
        localStorage.removeItem('feed_draft');
        setArticleTitle('');
        setIsArticleMode(false);
        setAttachments([]);
        setQuotingPost(null);
        setFeedCache({ recommended: null, all: null, following: null, trending: null });
      }
    } catch (err) {
      console.error('Erro ao criar post:', err);
      toast.error(err?.response?.data?.detail || 'Erro ao publicar post.');
    } finally {
      setPosting(false);
    }
  };

  const toggleReaction = async (postId, reaction) => {
    try {
      const { data } = await api.post(`/social/posts/${postId}/react`, { reaction });
      setReactions((prev) => ({ ...prev, [postId]: data.reactions }));
    } catch (err) {
      console.error('Erro ao reagir:', err);
    }
    setReactMenuFor(null);
  };

  const WEEKLY_TOPICS = [
    'Compartilhe seu setup de trabalho',
    'Qual foi o maior aprendizado da sua carreira?',
    'Recomende uma ferramenta que mudou seu fluxo',
    'Conte sobre um projeto desafiador',
    'Qual tecnologia voce quer aprender em 2026?',
    'Compartilhe uma dica de produtividade',
    'Qual norma tecnica voce mais consulta?',
    'Fale sobre um erro que te ensinou muito',
  ];
  const weeklyTopic = useMemo(() => {
    const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    return WEEKLY_TOPICS[weekNum % WEEKLY_TOPICS.length];
  }, []);

  const toggleLike = async (postId) => {
    // Optimistic UI: atualiza antes da resposta
    const prev = posts.find((p) => p.id === postId);
    const optimisticLiked = !prev?.liked;
    const optimisticCount = (prev?.like_count || 0) + (optimisticLiked ? 1 : -1);
    setPosts((current) =>
      current.map((p) =>
        p.id === postId ? { ...p, liked: optimisticLiked, like_count: Math.max(0, optimisticCount) } : p,
      ),
    );
    if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, liked: optimisticLiked, like_count: Math.max(0, optimisticCount) }));
    try {
      const { data } = await api.post(`/social/posts/${postId}/like`);
      // Sincroniza com valor real do servidor
      setPosts((current) =>
        current.map((p) =>
          p.id === postId ? { ...p, liked: data.liked, like_count: data.like_count } : p,
        ),
      );
      if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, liked: data.liked, like_count: data.like_count }));
      setFeedCache({ recommended: null, all: null, following: null, trending: null });
    } catch (err) {
      // Reverte em caso de erro
      setPosts((current) =>
        current.map((p) =>
          p.id === postId ? { ...p, liked: prev?.liked, like_count: prev?.like_count } : p,
        ),
      );
      if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, liked: prev?.liked, like_count: prev?.like_count }));
      console.error('Erro ao curtir post:', err);
    }
  };

  const toggleComments = async (postId) => {
    const isOpen = !!openComments[postId];
    setOpenComments((current) => ({ ...current, [postId]: !isOpen }));
    if (!isOpen && !commentsByPost[postId]) {
      await loadCommentsForPost(postId);
    }
  };

  const _detectMentionInInput = (key, value, inputEl) => {
    const cursorPos = inputEl?.selectionStart ?? value.length;
    const before = value.slice(0, cursorPos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setCmtMentionKey(key);
      setCmtMentionQuery(match[1]);
      setCmtMentionIndex(0);
    } else if (cmtMentionKey === key) {
      setCmtMentionKey(null);
      setCmtMentionQuery('');
      setCmtMentionResults([]);
    }
  };

  const handleCommentChange = (postId, value, event) => {
    setCommentInputs((current) => ({ ...current, [postId]: value }));
    _detectMentionInInput(String(postId), value, event?.target);
  };

  const handleReplyChange = (postId, commentId, value, event) => {
    const key = `${postId}:${commentId}`;
    setReplyInputs((current) => ({ ...current, [key]: value }));
    _detectMentionInInput(key, value, event?.target);
  };

  useEffect(() => {
    if (!cmtMentionKey || !cmtMentionQuery.trim()) {
      setCmtMentionResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/social/users/search', { params: { q: cmtMentionQuery, limit: 5 } });
        setCmtMentionResults(data.users || []);
      } catch (err) {
        console.warn('Erro ao buscar mencoes em comentarios:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [cmtMentionQuery, cmtMentionKey]);

  const selectCommentMention = (user) => {
    if (!cmtMentionKey) return;
    const isReply = cmtMentionKey.includes(':');
    const currentVal = isReply ? (replyInputs[cmtMentionKey] || '') : (commentInputs[cmtMentionKey] || '');
    const inputEl = cmtMentionRefs.current[cmtMentionKey];
    const cursorPos = inputEl?.selectionStart ?? currentVal.length;
    const before = currentVal.slice(0, cursorPos);
    const after = currentVal.slice(cursorPos);
    const newBefore = before.replace(/@\w*$/, `@${user.username} `);
    const newVal = newBefore + after;
    if (isReply) {
      setReplyInputs((c) => ({ ...c, [cmtMentionKey]: newVal }));
    } else {
      setCommentInputs((c) => ({ ...c, [cmtMentionKey]: newVal }));
    }
    setCmtMentionKey(null);
    setCmtMentionResults([]);
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.selectionStart = newBefore.length;
        inputEl.selectionEnd = newBefore.length;
      }
    }, 0);
  };

  const loadCommentsForPost = async (postId) => {
    try {
      const { data } = await api.get(`/social/posts/${postId}/comments`);
      setCommentsByPost((current) => ({
        ...current,
        [postId]: data.comments || [],
      }));
    } catch (err) {
      console.error('Erro ao carregar comentarios:', err);
    }
  };

  const handleCommentSubmit = async (postId) => {
    const content = (commentInputs[postId] || '').trim();
    if (!content) return;
    try {
      const { data } = await api.post(`/social/posts/${postId}/comments`, { content });
      if (data?.comment) {
        setCommentsByPost((current) => ({
          ...current,
          [postId]: [...(current[postId] || []), data.comment],
        }));
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? { ...post, comment_count: (post.comment_count || 0) + 1 }
              : post,
          ),
        );
        setCommentInputs((current) => ({ ...current, [postId]: '' }));
        setFeedCache({ recommended: null, all: null, following: null, trending: null });
      }
    } catch (err) {
      console.error('Erro ao comentar:', err);
    }
  };

  const handleReplySubmit = async (postId, commentId) => {
    const key = `${postId}:${commentId}`;
    const content = (replyInputs[key] || '').trim();
    if (!content) return;
    try {
      const { data } = await api.post(`/social/posts/${postId}/comments`, {
        content,
        parent_comment_id: commentId,
      });
      if (data?.comment) {
        setCommentsByPost((current) => ({
          ...current,
          [postId]: [...(current[postId] || []), data.comment],
        }));
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? { ...post, comment_count: (post.comment_count || 0) + 1 }
              : post,
          ),
        );
        setReplyInputs((current) => ({ ...current, [key]: '' }));
        setReplyOpen((current) => ({ ...current, [key]: false }));
        setFeedCache({ recommended: null, all: null, following: null, trending: null });
      }
    } catch (err) {
      console.error('Erro ao responder comentario:', err);
    }
  };

  const toggleCommentLike = async (postId, commentId) => {
    try {
      const { data } = await api.post(`/social/comments/${commentId}/like`);
      setCommentsByPost((current) => ({
        ...current,
        [postId]: (current[postId] || []).map((comment) =>
          comment.id === commentId
            ? { ...comment, liked: data.liked, like_count: data.like_count }
            : comment,
        ),
      }));
    } catch (err) {
      console.error('Erro ao curtir comentario:', err);
    }
  };

  const handleBlock = async (targetId) => {
    try {
      const { data } = await api.post(`/social/users/${targetId}/block`);
      setBlockMuteStatus(prev => ({ ...prev, is_blocked: data.blocked }));
      if (data.blocked) {
        setProfileData(prev => prev ? { ...prev, is_following: false } : prev);
      }
      toast.success(data.blocked ? 'Usuário bloqueado' : 'Usuário desbloqueado');
    } catch (err) {
      console.error('Erro ao bloquear:', err);
      toast.error('Erro ao bloquear usuário');
    }
  };

  const handleMute = async (targetId) => {
    try {
      const { data } = await api.post(`/social/users/${targetId}/mute`);
      setBlockMuteStatus(prev => ({ ...prev, is_muted: data.muted }));
      toast.success(data.muted ? 'Usuário silenciado' : 'Usuário não silenciado');
    } catch (err) {
      console.error('Erro ao silenciar:', err);
      toast.error('Erro ao silenciar usuário');
    }
  };

  const handleFollow = async (targetId) => {
    try {
      const { data } = await api.post(`/social/users/${targetId}/follow`);
      setSuggestions((current) =>
        data.following ? current.filter((item) => item.id !== targetId) : current,
      );
      fetchFeed();
      fetchSuggestions();
      setFeedCache({ recommended: null, all: null, following: null, trending: null });
    } catch (err) {
      console.error('Erro ao seguir usuario:', err);
    }
  };

  const handleDeletePost = async (postId) => {
    setConfirmModal({
      open: true,
      title: 'Excluir post',
      message: 'Tem certeza que deseja excluir este post? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await api.delete(`/social/posts/${postId}`);
          setPosts((current) => current.filter((post) => post.id !== postId));
          setMenuOpenFor(null);
          setFeedCache({ recommended: null, all: null, following: null, trending: null });
          toast.success('Post excluído com sucesso');
        } catch (err) {
          console.error('Erro ao excluir post:', err);
          toast.error('Erro ao excluir post');
        }
      },
    });
  };

  const toggleRepost = async (postId) => {
    const prev = posts.find((p) => p.id === postId);
    const optimisticReposted = !prev?.reposted;
    const optimisticCount = (prev?.repost_count || 0) + (optimisticReposted ? 1 : -1);
    const optimistic = { reposted: optimisticReposted, repost_count: Math.max(0, optimisticCount) };
    setPosts((current) => current.map((p) => (p.id === postId ? { ...p, ...optimistic } : p)));
    if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, ...optimistic }));
    try {
      const { data } = await api.post(`/social/posts/${postId}/repost`);
      const server = { reposted: data.reposted, repost_count: data.repost_count };
      setPosts((current) => current.map((p) => (p.id === postId ? { ...p, ...server } : p)));
      if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, ...server }));
      setFeedCache({ recommended: null, all: null, following: null, trending: null });
    } catch (err) {
      setPosts((current) => current.map((p) => (p.id === postId ? { ...p, reposted: prev?.reposted, repost_count: prev?.repost_count } : p)));
      if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, reposted: prev?.reposted, repost_count: prev?.repost_count }));
      console.error('Erro ao repostar:', err);
    }
  };

  const togglePinPost = async (postId) => {
    try {
      const { data } = await api.post(`/social/posts/${postId}/pin`);
      setPosts((current) => current.map(p => p.id === postId ? { ...p, pinned: data.pinned } : p));
      toast.success(data.pinned ? 'Post fixado no perfil' : 'Post desafixado');
      setMenuOpenFor(null);
    } catch {
      toast.error('Erro ao fixar post');
    }
  };

  const startEditPost = (post) => {
    setEditingPost(post.id);
    setEditContent(post.content);
    setEditTitle(post.title || '');
    setMenuOpenFor(null);
  };

  const cancelEditPost = () => {
    setEditingPost(null);
    setEditContent('');
    setEditTitle('');
  };

  const saveEditPost = async (postId) => {
    if (!editContent.trim()) return;
    setEditSaving(true);
    try {
      const payload = { content: editContent };
      if (editTitle.trim()) payload.title = editTitle.trim();
      const { data } = await api.put(`/social/posts/${postId}`, payload);
      if (data?.post) {
        setPosts((current) =>
          current.map((p) => (p.id === postId ? data.post : p)),
        );
        if (focusedPostData?.id === postId) setFocusedPostData(data.post);
        setFeedCache({ recommended: null, all: null, following: null, trending: null });
      }
      cancelEditPost();
    } catch (err) {
      console.error('Erro ao editar post:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const toggleMenu = (postId) => {
    setMenuOpenFor((current) => (current === postId ? null : postId));
  };

  const buildCommentTree = (items) => {
    const nodes = {};
    const roots = [];
    items.forEach((comment) => {
      nodes[comment.id] = { ...comment, replies: [] };
    });
    items.forEach((comment) => {
      const node = nodes[comment.id];
      if (comment.parent_comment_id && nodes[comment.parent_comment_id]) {
        nodes[comment.parent_comment_id].replies.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  };

  const countReplies = (comment) => {
    if (!comment.replies || comment.replies.length === 0) return 0;
    return comment.replies.reduce((total, reply) => total + 1 + countReplies(reply), 0);
  };

  const sortCommentsTree = (items) => {
    const sorted = [...items].sort((a, b) => {
      if (commentSort === 'top') {
        const diff = (b.like_count || 0) - (a.like_count || 0);
        if (diff !== 0) return diff;
      }
      const dateA = parseDate(a.created_at)?.getTime() || 0;
      const dateB = parseDate(b.created_at)?.getTime() || 0;
      return dateB - dateA;
    });
    return sorted.map((item) => ({
      ...item,
      replies: sortCommentsTree(item.replies || []),
    }));
  };

  const renderComment = (postId, comment, depth = 0) => {
    const commentAvatar = buildAvatarSrc(comment.photo, comment.photo_mime, comment.user_id);
    const key = `${postId}:${comment.id}`;
    const replyCount = countReplies(comment);
    return (
      <div key={comment.id} className="feed-comment-item">
        <div className="feed-comment-avatar feed-avatar-link" onClick={() => navigate(`/profile/${comment.user_id}`)}>
          {commentAvatar ? (
            <img src={commentAvatar} alt={comment.name || 'Perfil'} />
          ) : (
            <span>{(comment.name || 'U')[0]?.toUpperCase()}</span>
          )}
        </div>
        <div className="feed-comment-body">
          <div className="feed-comment-meta">
            <strong className="tw-name-link" onClick={() => navigate(`/profile/${comment.user_id}`)}>{comment.name || 'Usuario'}{comment.is_founder && <span className="tw-founder-badge" title="Fundador">F</span>}{comment.is_ai && <span className="tw-ai-badge" title="Arquimedes IA">IA</span>}</strong>
            <span className="tw-handle-link" onClick={() => navigate(`/profile/${comment.user_id}`)}>@{comment.username || 'usuario'}</span>
            <span className="tw-dot">.</span>
            <span>{formatTime(comment.created_at)}</span>
          </div>
          <p>{renderContentWithMentions(comment.content)}</p>
          <div className="feed-comment-actions">
            <button
              type="button"
              className="feed-reply-btn"
              onClick={() => setReplyOpen((current) => ({ ...current, [key]: !current[key] }))}
              onMouseDown={(event) => event.stopPropagation()}
            >
              Responder
            </button>
            <button
              type="button"
              className={`feed-like-btn ${comment.liked ? 'liked' : ''}`}
              onClick={() => toggleCommentLike(postId, comment.id)}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <Icon>
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
              </Icon>
              <span>{comment.like_count || 0}</span>
            </button>
            {replyCount > 0 && <span className="feed-reply-count">{replyCount} respostas</span>}
          </div>
          {replyOpen[key] && (
            <div className="feed-reply-input" style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Responder"
                value={replyInputs[key] || ''}
                ref={(el) => { cmtMentionRefs.current[key] = el; }}
                onChange={(event) => handleReplyChange(postId, comment.id, event.target.value, event)}
                onMouseDown={(event) => event.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => handleReplySubmit(postId, comment.id)}
                onMouseDown={(event) => event.stopPropagation()}
              >
                Enviar
              </button>
              {cmtMentionKey === key && cmtMentionResults.length > 0 && (
                <div className="tw-mention-dropdown">
                  {cmtMentionResults.map((user, i) => renderMentionItem(user, i, cmtMentionIndex, selectCommentMention, setCmtMentionIndex))}
                </div>
              )}
            </div>
          )}
          {comment.replies.length > 0 && (
            <div className="feed-comment-replies">
              {comment.replies.map((reply) => renderComment(postId, reply, depth + 1))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (!files.length) return;
    const remaining = Math.max(0, 4 - attachments.length);
    const selected = files.slice(0, remaining);
    const results = await Promise.all(
      selected.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || '');
              const parts = result.split(',');
              const meta = parts[0] || '';
              const data = parts[1] || '';
              const match = meta.match(/data:(.*);base64/);
              resolve({
                id: `${file.name}-${file.size}-${Date.now()}`,
                data,
                mime: match ? match[1] : file.type || 'image/jpeg',
                name: file.name,
              });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );
    setAttachments((current) => [...current, ...results].slice(0, 4));
    event.target.value = '';
  };

  const removeAttachment = (id) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  };

  const saveRecentSearches = (items) => {
    setRecentSearches(items);
    try {
      localStorage.setItem('feed_recent_searches', JSON.stringify(items));
    } catch (err) {
      console.warn('Nao foi possivel salvar buscas recentes do feed:', err);
    }
  };

  const addRecentSearch = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recentSearches.filter((item) => item !== trimmed)].slice(0, 8);
    saveRecentSearches(next);
  };

  const removeRecentSearch = (value) => {
    saveRecentSearches(recentSearches.filter((item) => item !== value));
  };

  const clearRecentSearches = () => {
    saveRecentSearches([]);
  };

  const [userResults, setUserResults] = useState([]);

  const runSearch = async (value) => {
    const term = value.trim();
    if (!term) {
      setSearchResults([]);
      setUserResults([]);
      setSearchActive(false);
      return;
    }
    setSearching(true);
    setSearchActive(true);
    try {
      const params = { q: term, mode: feedMode };
      if (searchFilters.date_from) params.date_from = searchFilters.date_from;
      if (searchFilters.date_to) params.date_to = searchFilters.date_to;
      if (searchFilters.content_type) params.content_type = searchFilters.content_type;
      if (searchFilters.author) params.author = searchFilters.author;
      const [postsRes, usersRes] = await Promise.all([
        api.get('/social/search', { params }),
        api.get('/social/users/search', { params: { q: term, limit: 5 } }),
      ]);
      setSearchResults(postsRes.data.results || []);
      setUserResults(usersRes.data.users || usersRes.data || []);
      addRecentSearch(term);
    } catch (err) {
      console.error('Erro ao buscar no feed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    runSearch(searchTerm);
  };

  const handleRecentClick = (value) => {
    setSearchTerm(value);
    runSearch(value);
  };

  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return;
    const timer = setTimeout(() => {
      runSearch(term);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);


  const addEmojiToDraft = (emoji) => {
    const textarea = composerRef.current;
    if (!textarea) {
      setDraft((current) => `${current}${emoji} `);
      return;
    }
    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + emoji.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  useEffect(() => {
    if (!mentionActive || !mentionQuery.trim()) {
      setMentionResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/social/users/search', { params: { q: mentionQuery, limit: 5 } });
        setMentionResults(data.users || []);
      } catch (err) {
        console.warn('Erro ao buscar mencoes no composer do feed:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [mentionQuery, mentionActive]);

  const handleDraftChange = (e) => {
    const value = e.target.value;
    setDraft(value);
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionActive(true);
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionActive(false);
      setMentionQuery('');
    }
  };

  const selectMention = (user) => {
    const textarea = draftRef.current || composerRef.current;
    const cursorPos = textarea?.selectionStart || draft.length;
    const textBeforeCursor = draft.slice(0, cursorPos);
    const textAfterCursor = draft.slice(cursorPos);
    const newBefore = textBeforeCursor.replace(/@\w*$/, `@${user.username} `);
    setDraft(newBefore + textAfterCursor);
    setMentionActive(false);
    setMentionResults([]);
    setTimeout(() => {
      const ta = draftRef.current || composerRef.current;
      if (ta) {
        ta.focus();
        ta.selectionStart = newBefore.length;
        ta.selectionEnd = newBefore.length;
      }
    }, 0);
  };

  const renderMentionItem = (user, index, activeIndex, onSelect, onHover) => (
    <div key={user.id} className={`tw-mention-item ${index === activeIndex ? 'active' : ''}`} onClick={() => onSelect(user)} onMouseEnter={() => onHover(index)}>
      <img src={buildAvatarSrc(null, null, user.id)} alt="" className="tw-mention-avatar" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'grid'); }} />
      <div className="tw-mention-avatar tw-mention-initial" style={{ display: 'none' }}>{(user.name || user.username || '?')[0].toUpperCase()}</div>
      <div className="tw-mention-info">
        <span className="tw-mention-name">{user.name}</span>
        <span className="tw-mention-handle">@{user.username}</span>
        {user.following && (
          <span className="tw-mention-following">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            Seguindo
          </span>
        )}
      </div>
    </div>
  );

  const renderContentWithMentions = (content) => {
    if (!content) return null;
    const parts = content.split(/(@\w+|#\w{2,30})/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="tw-mention-link">{part}</span>;
      }
      if (/^#\w{2,30}$/.test(part)) {
        return (
          <span key={i} className="feed-hashtag" onClick={(e) => {
            e.stopPropagation();
            setSearchTerm(part);
            runSearch(part);
          }}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const sharePost = async (post) => {
    const url = `${window.location.origin}/feed/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: post.title || 'Post', url }); }
      catch (err) {
        if (err?.name !== 'AbortError') {
          console.warn('Erro ao compartilhar post:', err);
        }
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  };

  const translatePost = (post) => {
    const text = encodeURIComponent(post.content?.slice(0, 500) || '');
    window.open(`https://translate.google.com/?sl=auto&tl=pt&text=${text}`, '_blank');
  };

  const sendTypingIndicator = (postId) => {
    if (typingTimeoutRef.current[postId]) return;
    typingTimeoutRef.current[postId] = true;
    setTimeout(() => { typingTimeoutRef.current[postId] = false; }, 3000);
  };

  const SkeletonSidebar = () => (
    <div className="feed-card feed-skeleton-card">
      <div className="feed-skeleton-line" style={{ width: '60%', height: 14 }} />
      <div className="feed-skeleton-line" style={{ width: '100%', height: 10 }} />
      <div className="feed-skeleton-line" style={{ width: '80%', height: 10 }} />
      <div className="feed-skeleton-line" style={{ width: '90%', height: 10 }} />
    </div>
  );

  const toggleAnnouncement = async (postId) => {
    try {
      const { data } = await api.post(`/social/posts/${postId}/announce`);
      setPosts((current) => current.map((p) => p.id === postId ? { ...p, is_announcement: data.is_announcement } : p));
      if (focusedPostData?.id === postId) setFocusedPostData((p) => ({ ...p, is_announcement: data.is_announcement }));
      toast.success(data.is_announcement ? 'Marcado como anuncio' : 'Anuncio removido');
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Erro ao alternar anuncio:', err);
      toast.error('Erro ao alternar anuncio');
    }
  };

  return (
    <div className="feed-page">
      {scrollProgress > 0 && (
        <div className="feed-scroll-progress" style={{ width: `${scrollProgress * 100}%` }} />
      )}
      {hashtagFilter && (
        <div className="feed-hashtag-banner">
          <span>Filtrando por <strong>#{hashtagFilter}</strong></span>
          <button type="button" onClick={() => { setHashtagFilter(null); setSearchActive(false); setSearchTerm(''); }}>
            <Icon width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
            Limpar
          </button>
        </div>
      )}
      <div className="feed-grid">
        <section className="feed-column feed-center">
          {!profileUserId && !postId && !hashtagFilter && <SigsHeader onTabChange={setSigsTab} />}
          {profileUserId && profileData && (
            <div className="feed-profile-view">
              <div className="feed-focus-header">
                <button type="button" className="feed-focus-back" onClick={() => navigate('/feed')}>
                  <Icon><path d="M15 18l-6-6 6-6" /></Icon>
                </button>
                <h3>{profileData.name || 'Perfil'}</h3>
              </div>
              <div className="feed-profile-card">
                <div className="feed-profile-avatar">
                  {(profileData.photo || profileData.id) ? (
                    <img src={buildAvatarSrc(profileData.photo, profileData.photo_mime, profileData.id)} alt={profileData.name} />
                  ) : (
                    <span>{(profileData.name || 'U')[0]?.toUpperCase()}</span>
                  )}
                </div>
                <h2>{profileData.name}</h2>
                <span className="tw-handle">@{profileData.username}</span>
                <div className="feed-profile-stats">
                  <span><strong>{profileData.post_count}</strong> posts</span>
                  <span><strong>{profileData.follower_count}</strong> seguidores</span>
                  <span><strong>{profileData.following_count}</strong> seguindo</span>
                </div>
                {currentUser?.id !== profileData.id && (
                  <>
                    <button
                      type="button"
                      className={`feed-profile-follow ${profileData.is_following ? 'following' : ''}`}
                      onClick={() => handleFollow(profileData.id).then(() => {
                        setProfileData((prev) => prev ? { ...prev, is_following: !prev.is_following, follower_count: prev.follower_count + (prev.is_following ? -1 : 1) } : prev);
                      })}
                    >
                      {profileData.is_following ? 'Seguindo' : 'Seguir'}
                    </button>
                    <button
                      type="button"
                      className="feed-profile-follow"
                      style={{ marginTop: 4 }}
                      onClick={async () => {
                        try {
                          const { data } = await api.post(`/social/dm/conversations/${profileData.id}`);
                          navigate(`/messages/${data.conversation_id}`);
                        } catch (err) {
                          console.error('Erro ao criar conversa DM:', err);
                        }
                      }}
                    >
                      Enviar mensagem
                    </button>
                    <button
                      type="button"
                      className={`feed-profile-follow ${blockMuteStatus.is_muted ? 'following' : ''}`}
                      style={{ marginTop: 4, fontSize: '0.85rem' }}
                      onClick={() => handleMute(profileData.id)}
                    >
                      {blockMuteStatus.is_muted ? 'Silenciado' : 'Silenciar'}
                    </button>
                    <button
                      type="button"
                      className="feed-profile-follow"
                      style={{ marginTop: 4, fontSize: '0.85rem', color: blockMuteStatus.is_blocked ? '#ff6b6b' : undefined, borderColor: blockMuteStatus.is_blocked ? '#ff6b6b' : undefined }}
                      onClick={() => handleBlock(profileData.id)}
                    >
                      {blockMuteStatus.is_blocked ? 'Desbloquear' : 'Bloquear'}
                    </button>
                  </>
                )}
              </div>
              <h4 className="feed-profile-section-title">Posts</h4>
              {profilePosts.length === 0 && <div className="feed-empty">Nenhum post ainda.</div>}
              {profilePosts.map((post) => {
                const avatarSrc = buildAvatarSrc(post.photo, post.photo_mime, post.user_id);
                return (
                  <article key={post.id} className="tw-card feed-post" onClick={() => navigate(`/feed/${post.id}`)} role="button" tabIndex={0}>
                    <div className="tw-header">
                      <div className="feed-avatar feed-avatar-link" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>
                        {avatarSrc ? <img src={avatarSrc} alt={post.name} /> : <span>{(post.name || 'U')[0]?.toUpperCase()}</span>}
                      </div>
                      <div className="feed-author">
                        <div className="tw-name tw-name-link" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>{post.name}{post.is_founder && <span className="tw-founder-badge" title="Fundador">F</span>}{post.is_ai && <span className="tw-ai-badge" title="Arquimedes IA">IA</span>}</div>
                        <span className="tw-handle tw-handle-link" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>@{post.username}</span>
                        <span className="tw-dot">.</span>
                        <span className="tw-time">{formatTime(post.created_at)}</span>
                      </div>
                    </div>
                    <div className="tw-body">
                      {post.is_article && post.title && <h3 className="tw-article-heading">{post.title}</h3>}
                      {post.is_article && <span className="tw-article-badge">Artigo</span>}
                      <p className="tw-text">{renderContentWithMentions(post.content?.slice(0, 200))}{post.content?.length > 200 ? '...' : ''}</p>
                      <PollDisplay postId={post.id} />
                    </div>
                    <div className="tw-actions">
                      <span className="tw-action"><Icon><path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></Icon><span>{post.comment_count || 0}</span></span>
                      <span className="tw-action"><Icon><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" /></Icon><span>{post.like_count || 0}</span></span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!focusedPost && !profileUserId && sigsTab === 'feed' && (
            <div className={`tw-compose feed-compose ${isArticleMode ? 'article-mode' : ''}`}>
            <div className="tw-compose-mode-toggle">
              <button
                type="button"
                className={`tw-mode-btn ${!isArticleMode && !isPollMode ? 'active' : ''}`}
                onClick={() => { setIsArticleMode(false); setIsPollMode(false); }}
              >
                <Icon width="14" height="14">
                  <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                </Icon>
                Post
              </button>
              <button
                type="button"
                className={`tw-mode-btn ${isArticleMode ? 'active' : ''}`}
                onClick={() => { setIsArticleMode(true); setIsPollMode(false); }}
              >
                <Icon width="14" height="14">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </Icon>
                Artigo
              </button>
              <button
                type="button"
                className={`tw-mode-btn ${isPollMode ? 'active' : ''}`}
                onClick={() => { setIsPollMode(true); setIsArticleMode(false); }}
              >
                <Icon width="14" height="14">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 8h3" /><path d="M7 12h7" /><path d="M7 16h5" />
                </Icon>
                Enquete
              </button>
            </div>
            {isArticleMode && (
              <input
                type="text"
                className="tw-article-title"
                placeholder="Titulo do artigo tecnico..."
                value={articleTitle}
                onChange={(event) => setArticleTitle(event.target.value)}
              />
            )}
            {isPollMode && (
              <div className="tw-poll-form">
                <input type="text" placeholder="Pergunta da enquete..." value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} className="tw-poll-question" />
                {pollOptions.map((opt, i) => (
                  <div key={i} className="tw-poll-option-row">
                    <input type="text" placeholder={`Opcao ${i + 1}`} value={opt} onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }} className="tw-poll-option-input" />
                    {pollOptions.length > 2 && (
                      <button type="button" className="tw-poll-remove-opt" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>x</button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button type="button" className="tw-poll-add-opt" onClick={() => setPollOptions([...pollOptions, ''])}>+ Adicionar opcao</button>
                )}
                <div className="tw-poll-expires">
                  <span>Encerra em:</span>
                  <select value={pollExpires} onChange={e => setPollExpires(Number(e.target.value))}>
                    <option value={6}>6 horas</option>
                    <option value={12}>12 horas</option>
                    <option value={24}>1 dia</option>
                    <option value={72}>3 dias</option>
                    <option value={168}>7 dias</option>
                  </select>
                </div>
              </div>
            )}
            <div
              className={`tw-compose-row ${draft ? '' : 'drop-zone'}`}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                if (files.length) handleFilesSelected({ target: { files, value: '' } });
              }}
            >
              <div className="tw-avatar">{placeholderName[0]?.toUpperCase()}</div>
              <textarea
                className="tw-compose-input"
                rows={isArticleMode ? 6 : 2}
                placeholder={composerPlaceholder}
                value={draft}
                onChange={handleDraftChange}
                ref={(el) => { composerRef.current = el; draftRef.current = el; }}
              />
              {mentionActive && mentionResults.length > 0 && (
                <div className="tw-mention-dropdown">
                  {mentionResults.map((user, i) => renderMentionItem(user, i, mentionIndex, selectMention, setMentionIndex))}
                </div>
              )}
            </div>
            <div className="tw-compose-actions">
              <div className="tw-icons">
                <label className="feed-icon-label" aria-label="Adicionar imagem">
                  <Icon>
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10.5" r="1.5" />
                    <path d="M21 15l-5-5-4 4-2-2-5 5" />
                  </Icon>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesSelected}
                  />
                </label>
                <div className="feed-emoji">
                  <button
                    type="button"
                    className="feed-emoji-btn"
                    aria-label="Adicionar emoticon"
                    onClick={() => setEmojiOpen((current) => !current)}
                  >
                    <Icon>
                      <path d="M12 21c4.4 0 8-3.6 8-8 0-4.4-3.6-8-8-8-4.4 0-8 3.6-8 8 0 4.4 3.6 8 8 8z" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <path d="M9 10h.01" />
                      <path d="M15 10h.01" />
                    </Icon>
                  </button>
                  {emojiOpen && (
                    <div className="feed-emoji-panel">
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="feed-emoji-item"
                          onClick={() => addEmojiToDraft(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {(() => {
                const MAX_CHARS = isArticleMode ? 5000 : 280;
                const remaining = MAX_CHARS - draft.length;
                const pct = Math.min(draft.length / MAX_CHARS, 1);
                const r = 10;
                const circ = 2 * Math.PI * r;
                const warn = remaining <= 20;
                const over = remaining < 0;
                return draft.length > 0 ? (
                  <div className="tw-char-counter">
                    <svg width="26" height="26" viewBox="0 0 26 26">
                      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--feed-border)" strokeWidth="2" />
                      <circle cx="13" cy="13" r={r} fill="none" stroke={over ? '#f4212e' : warn ? '#ffd400' : 'var(--feed-accent)'} strokeWidth="2" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                    </svg>
                    {warn && <span className={`tw-char-count ${over ? 'over' : 'warn'}`}>{remaining}</span>}
                  </div>
                ) : null;
              })()}
              <button className="feed-post-btn" onClick={handlePost} disabled={posting || draft.length > (isArticleMode ? 5000 : 280) || (isArticleMode && !articleTitle.trim()) || (isPollMode && (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2))}>
                {posting ? 'Publicando...' : isPollMode ? 'Criar enquete' : isArticleMode ? 'Publicar artigo' : 'Postar'}
              </button>
            </div>
            {attachments.length > 0 && (
              <div className={`tw-preview ${attachments.length > 1 ? 'multi' : ''}`}>
                {attachments.map((item) => (
                  <div key={item.id} className="tw-thumb">
                    <img src={buildMediaSrc(item)} alt={item.name || 'Imagem'} />
                    <button
                      className="tw-remove"
                      type="button"
                      onClick={() => removeAttachment(item.id)}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            {quotingPost && (
              <div className="tw-quote-preview">
                <div className="tw-quote-header">
                  <span>Citando @{quotingPost.username}</span>
                  <button type="button" onClick={() => setQuotingPost(null)}>x</button>
                </div>
                <p>{quotingPost.content?.slice(0, 100)}{quotingPost.content?.length > 100 ? '...' : ''}</p>
              </div>
            )}
            </div>
          )}

          <div className="feed-list" style={sigsTab === 'tarefas' && !profileUserId && !postId ? { display: 'none' } : {}}>
            {!focusedPost && (
              <div className="feed-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={feedMode === 'recommended'}
                  className={`feed-tab ${feedMode === 'recommended' ? 'active' : ''}`}
                  onClick={() => setFeedMode('recommended')}
                >
                  Para Você
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={feedMode === 'following'}
                  className={`feed-tab ${feedMode === 'following' ? 'active' : ''}`}
                  onClick={() => setFeedMode('following')}
                >
                  Seguindo
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={feedMode === 'trending'}
                  className={`feed-tab ${feedMode === 'trending' ? 'active' : ''}`}
                  onClick={() => setFeedMode('trending')}
                >
                  Em Alta
                </button>
              </div>
            )}
            {newPostsCount > 0 && !loading && (
              <button
                className="tw-new-posts-banner"
                onClick={loadNewPosts}
                style={{
                  width: '100%', padding: '10px', margin: '0 0 8px', border: 'none',
                  borderRadius: '12px', background: 'var(--primary, #1d9bf0)', color: '#fff',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600, textAlign: 'center',
                }}
              >
                Ver {newPostsCount} {newPostsCount === 1 ? 'novo post' : 'novos posts'}
              </button>
            )}
            {loading && <SkeletonFeed count={4} />}
            {!loading && displayedPosts.length === 0 && isFirstTime && (
                <div className="feed-welcome-card">
                  <div className="feed-welcome-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--feed-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <h3>Bem-vindo ao Feed!</h3>
                  <p>Este e o espaco da comunidade. Compartilhe conhecimento, tire duvidas e conecte-se com outros profissionais.</p>
                  <div className="feed-welcome-actions">
                    <button type="button" className="feed-welcome-btn primary" onClick={() => { composerRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      Criar meu primeiro post
                    </button>
                    <button type="button" className="feed-welcome-btn secondary" onClick={() => {
                      if (feedMode === 'recommended') {
                        setFeedCache(prev => ({ ...prev, recommended: null }));
                        setLoading(true);
                        fetchFeed();
                      } else {
                        setFeedMode('recommended');
                      }
                    }}>
                      Explorar posts
                    </button>
                  </div>
                  <div className="feed-welcome-tips">
                    <div className="feed-welcome-tip">
                      <strong>Dica:</strong> Siga outros membros para ver seus posts na aba "Seguindo"
                    </div>
                    <div className="feed-welcome-tip">
                      <strong>Dica:</strong> Escreva artigos tecnicos em Markdown para compartilhar conhecimento
                    </div>
                  </div>
                </div>
            )}
            {!loading && displayedPosts.length === 0 && !isFirstTime && feedMode === 'following' && (
              <div className="feed-empty">
                <p>Nenhum post no seu feed. Siga outros membros ou explore todos os posts.</p>
                <button type="button" className="feed-welcome-btn secondary" style={{ marginTop: 12 }} onClick={() => setFeedMode('recommended')}>
                  Explorar posts
                </button>
              </div>
            )}
            {focusedPost && (
              <div className="feed-focus-inline">
                <div className="feed-focus-header">
                <button
                  type="button"
                  className="feed-focus-back"
                  onClick={() => navigate('/feed')}
                >
                    <Icon>
                      <path d="M15 18l-6-6 6-6" />
                    </Icon>
                  </button>
                  <h3>Post</h3>
                </div>
                <article className="tw-card feed-post feed-post-focus">
                  <div className="tw-header">
                    <div className="feed-avatar feed-avatar-link" onClick={() => navigate(`/profile/${focusedPost.user_id}`)}>
                      {(focusedPost.photo || focusedPost.user_id) ? (
                        <img
                          src={buildAvatarSrc(focusedPost.photo, focusedPost.photo_mime, focusedPost.user_id)}
                          alt={focusedPost.name || 'Perfil'}
                        />
                      ) : (
                        <span>{(focusedPost.name || 'U')[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="feed-author">
                      <div className="tw-name tw-name-link" onClick={() => navigate(`/profile/${focusedPost.user_id}`)}>{focusedPost.name || 'Usuario'}{focusedPost.is_founder && <span className="tw-founder-badge" title="Fundador">F</span>}{focusedPost.is_ai && <span className="tw-ai-badge" title="Arquimedes IA">IA</span>}</div>
                      <span className="tw-handle tw-handle-link" onClick={() => navigate(`/profile/${focusedPost.user_id}`)}>@{focusedPost.username || 'usuario'}</span>
                      <span className="tw-dot">.</span>
                      <span className="tw-time">{formatTime(focusedPost.created_at)}</span>
                      {focusedPost.view_count > 0 && (
                        <span className="tw-views">
                          <Icon width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>
                          {focusedPost.view_count}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="tw-body">
                    {focusedPost.is_announcement && (
                      <div className="feed-announcement-badge">
                        <Icon width="14" height="14"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></Icon>
                        Anuncio
                      </div>
                    )}
                    {focusedPost.is_article && focusedPost.title && (
                      <h3 className="tw-article-heading">{focusedPost.title}</h3>
                    )}
                    {focusedPost.is_article && (
                      <div className="tw-article-meta">
                        <span className="tw-article-badge">Artigo</span>
                        <span className="tw-reading-time">{getReadingTime(focusedPost.content)} min de leitura</span>
                      </div>
                    )}
                    {renderTags(focusedPost.tags)}
                    {focusedPost.is_article ? (
                      <div className="tw-text tw-article-content">
                        <MarkdownRenderer content={focusedPost.content} />
                      </div>
                    ) : (
                      <p className="tw-text">{renderContentWithMentions(focusedPost.content)}</p>
                    )}
                    {(() => {
                      const urls = focusedPost.content?.match(URL_REGEX);
                      return urls?.[0] ? <LinkPreview url={urls[0]} /> : null;
                    })()}
                    <PollDisplay postId={focusedPost.id} />
                    <QuotedPostEmbed post={focusedPost.quoted_post} quotedPostId={focusedPost.quoted_post_id} navigate={navigate} />
                    {focusedPost.media && focusedPost.media.length > 0 && (
                      <div
                        className={`feed-media ${
                          focusedPost.media.length > 1 ? 'feed-media-grid' : ''
                        }`}
                      >
                        {focusedPost.media.map((item, idx) => {
                          const mediaSrc = buildMediaSrc(item);
                          if (!mediaSrc) return null;
                          return (
                            <img
                              key={`${focusedPost.id}-media-${idx}`}
                              src={mediaSrc}
                              alt={`Midia ${idx + 1}`}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setLightbox({ images: focusedPost.media, index: idx })}
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
                      onClick={() => toggleComments(focusedPost.id)}
                      aria-label="Comentar"
                    >
                      <Icon>
                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      </Icon>
                      <span>{focusedPost.comment_count || 0}</span>
                    </button>
                    <div style={{ position: 'relative' }}>
                      <button
                        className={`tw-action ${focusedPost.reposted ? 'reposted' : ''}`}
                        type="button"
                        onClick={() => setRepostMenuFor(repostMenuFor === `focused-${focusedPost.id}` ? null : `focused-${focusedPost.id}`)}
                        title="Repostar ou Citar"
                        aria-label="Compartilhar"
                      >
                        <Icon>
                          <polyline points="17 1 21 5 17 9" />
                          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                          <polyline points="7 23 3 19 7 15" />
                          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </Icon>
                        <span>{focusedPost.repost_count || 0}</span>
                      </button>
                      {repostMenuFor === `focused-${focusedPost.id}` && (
                        <div className="tw-repost-dropdown">
                          <button onClick={() => { toggleRepost(focusedPost.id); setRepostMenuFor(null); }}>
                            {focusedPost.reposted ? 'Desfazer repost' : 'Repostar'}
                          </button>
                          <button onClick={() => {
                            setQuotingPost(focusedPost);
                            setRepostMenuFor(null);
                            composerRef.current?.focus();
                          }}>
                            Citar
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      className={`tw-action ${focusedPost.liked ? 'liked' : ''}`}
                      type="button"
                      onClick={() => toggleLike(focusedPost.id)}
                      aria-label={focusedPost.liked ? 'Descurtir' : 'Curtir'}
                    >
                      <Icon>
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
                      </Icon>
                      <span>{focusedPost.like_count || 0}</span>
                    </button>
                    <button className="tw-action" type="button" onClick={(e) => { e.stopPropagation(); sharePost(focusedPost); }} title="Compartilhar">
                      <Icon width="16" height="16"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></Icon>
                    </button>
                  </div>

                  {openComments[focusedPost.id] && (
                    <div className="feed-comment-section">
                      <div className="feed-comment-sort">
                        <span>Ordenar:</span>
                        <button
                          type="button"
                          className={commentSort === 'recent' ? 'active' : ''}
                          onClick={() => setCommentSort('recent')}
                        >
                          Mais recentes
                        </button>
                        <button
                          type="button"
                          className={commentSort === 'top' ? 'active' : ''}
                          onClick={() => setCommentSort('top')}
                        >
                          Mais curtidas
                        </button>
                      </div>
                      <div className="feed-comment-input" style={{ position: 'relative' }}>
                        <input
                          type="text"
                          placeholder="Comentar"
                          value={commentInputs[focusedPost.id] || ''}
                          ref={(el) => { cmtMentionRefs.current[String(focusedPost.id)] = el; }}
                          onChange={(event) =>
                            handleCommentChange(focusedPost.id, event.target.value, event)
                          }
                          onInput={() => sendTypingIndicator(focusedPost.id)}
                        />
                        <button
                          type="button"
                          onClick={() => handleCommentSubmit(focusedPost.id)}
                        >
                          Enviar
                        </button>
                        {cmtMentionKey === String(focusedPost.id) && cmtMentionResults.length > 0 && (
                          <div className="tw-mention-dropdown">
                            {cmtMentionResults.map((user, i) => renderMentionItem(user, i, cmtMentionIndex, selectCommentMention, setCmtMentionIndex))}
                          </div>
                        )}
                      </div>
                  <div className="feed-comment-list">
                    {sortCommentsTree(
                      buildCommentTree(commentsByPost[focusedPost.id] || []),
                    ).map((comment) => renderComment(focusedPost.id, comment))}
                  </div>
                </div>
              )}
            </article>
          </div>
            )}
            {!focusedPost &&
              displayedPosts.map((post, index) => {
              const avatarSrc = buildAvatarSrc(post.photo, post.photo_mime, post.user_id);
              return (
                <article
                  key={post.id}
                  className="tw-card feed-post"
                  style={{ animationDelay: `${index * 80}ms` }}
                  onClick={() => navigate(`/feed/${post.id}`)}
                  onTouchEnd={() => handleDoubleTap(post.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') navigate(`/feed/${post.id}`);
                  }}
                >
                  {doubleTapHeart === post.id && (
                    <div className="feed-doubletap-heart">
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="#f91880" stroke="none">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
                      </svg>
                    </div>
                  )}
                  {post.pinned && (
                    <div className="tw-pinned-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 17v5"/><path d="M9 2h6l-1.5 5H18l-6 10-6-10h4.5z"/></svg>
                      Fixado
                    </div>
                  )}
                  {post.is_announcement && (
                    <div className="feed-announcement-badge">
                      <Icon width="14" height="14"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></Icon>
                      Anuncio
                    </div>
                  )}
                  <div className="tw-header">
                    <div className="feed-avatar feed-avatar-link" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={post.name || 'Perfil'} />
                      ) : (
                        <span>{(post.name || 'U')[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="feed-author">
                      <div className="tw-name tw-name-link" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>{post.name || 'Usuario'}</div>
                      <span
                        className="tw-handle tw-handle-link"
                        onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}
                      >@{post.username || 'usuario'}</span>
                      <span className="tw-dot">.</span>
                      <span className="tw-time">{formatTime(post.created_at)}</span>
                    </div>
                    <div className="feed-menu">
                  <button
                    className="feed-icon-btn subtle"
                    aria-label="Mais opcoes"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMenu(post.id);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                        <Icon>
                          <circle cx="5" cy="12" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="19" cy="12" r="1.5" />
                        </Icon>
                      </button>
                      {menuOpenFor === post.id && currentUser?.id === post.user_id && (
                        <div className="feed-menu-dropdown">
                          <button
                            type="button"
                            className="feed-menu-item"
                            onClick={(e) => { e.stopPropagation(); startEditPost(post); }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="feed-menu-item"
                            onClick={(e) => { e.stopPropagation(); togglePinPost(post.id); }}
                          >
                            {post.pinned ? 'Desafixar' : 'Fixar no perfil'}
                          </button>
                          <button
                            type="button"
                            className="feed-menu-item danger"
                            onClick={(e) => { e.stopPropagation(); handleDeletePost(post.id); }}
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            className="feed-menu-item"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const { data } = await api.get(`/social/analytics/posts/${post.id}`);
                                setAnalyticsData(data.analytics);
                              } catch (err) { console.error('Erro analytics:', err); }
                              setMenuOpenFor(null);
                            }}
                          >
                            Analytics
                          </button>
                          {currentUser?.is_founder && (
                            <button
                              type="button"
                              className="feed-menu-item"
                              onClick={(e) => { e.stopPropagation(); toggleAnnouncement(post.id); }}
                            >
                              {post.is_announcement ? 'Remover anuncio' : 'Marcar como anuncio'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="feed-menu-item"
                            onClick={(e) => { e.stopPropagation(); translatePost(post); setMenuOpenFor(null); }}
                          >
                            Traduzir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="tw-body">
                    {editingPost === post.id ? (
                      <div className="tw-edit-form" onClick={(e) => e.stopPropagation()}>
                        {(post.is_article || editTitle) && (
                          <input
                            type="text"
                            className="tw-article-title"
                            placeholder="Titulo do artigo..."
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                          />
                        )}
                        <textarea
                          className="tw-edit-textarea"
                          rows={post.is_article ? 8 : 3}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <div className="tw-edit-actions">
                          <button type="button" className="tw-edit-cancel" onClick={cancelEditPost}>Cancelar</button>
                          <button type="button" className="tw-edit-save" onClick={() => saveEditPost(post.id)} disabled={editSaving || !editContent.trim()}>
                            {editSaving ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {post.is_article && post.title && (
                          <h3 className="tw-article-heading">{post.title}</h3>
                        )}
                        {post.is_article && (
                          <div className="tw-article-meta">
                            <span className="tw-article-badge">Artigo</span>
                            <span className="tw-reading-time">{getReadingTime(post.content)} min de leitura</span>
                          </div>
                        )}
                        {renderTags(post.tags)}
                        {post.is_article ? (
                          <div className="tw-text tw-article-content" onClick={(e) => e.stopPropagation()}>
                            <MarkdownRenderer content={post.content.length > 400 && !focusedPost ? post.content.slice(0, 400) + '...' : post.content} />
                            {post.content.length > 400 && !focusedPost && (
                              <button className="tw-read-more" type="button" onClick={(e) => { e.stopPropagation(); navigate(`/feed/${post.id}`); }}>
                                Ler mais
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="tw-text">{renderContentWithMentions(post.content)}</p>
                        )}
                        {(() => {
                          const urls = post.content?.match(URL_REGEX);
                          return urls?.[0] ? <LinkPreview url={urls[0]} /> : null;
                        })()}
                      </>
                    )}
                    <PollDisplay postId={post.id} />
                    <QuotedPostEmbed post={post.quoted_post} quotedPostId={post.quoted_post_id} navigate={navigate} />
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
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); setLightbox({ images: post.media, index: idx }); }}
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
                    onClick={() => toggleComments(post.id)}
                    onMouseDown={(event) => event.stopPropagation()}
                    aria-label="Comentar"
                  >
                      <Icon>
                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      </Icon>
                      <span>{post.comment_count || 0}</span>
                    </button>
                  <div style={{ position: 'relative' }}>
                    <button
                      className={`tw-action ${post.reposted ? 'reposted' : ''}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRepostMenuFor(repostMenuFor === post.id ? null : post.id);
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      title="Repostar ou Citar"
                      aria-label="Compartilhar"
                    >
                      <Icon>
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </Icon>
                      <span>{post.repost_count || 0}</span>
                    </button>
                    {repostMenuFor === post.id && (
                      <div className="tw-repost-dropdown" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { toggleRepost(post.id); setRepostMenuFor(null); }}>
                          {post.reposted ? 'Desfazer repost' : 'Repostar'}
                        </button>
                        <button onClick={() => {
                          setQuotingPost(post);
                          setRepostMenuFor(null);
                          composerRef.current?.focus();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}>
                          Citar
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className={`tw-action ${post.liked ? 'liked' : ''}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLike(post.id);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    aria-label={post.liked ? 'Descurtir' : 'Curtir'}
                  >
                      <Icon>
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
                      </Icon>
                      <span>{post.like_count || 0}</span>
                    </button>
                  <div style={{ position: 'relative' }}>
                    <button
                      className="tw-action tw-action-react"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setReactMenuFor(reactMenuFor === post.id ? null : post.id); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Reagir"
                    >
                      <Icon width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></Icon>
                    </button>
                    {reactMenuFor === post.id && (
                      <div className="tw-react-dropdown" onClick={(e) => e.stopPropagation()}>
                        {[
                          { key: 'useful', emoji: '💡', label: 'Util' },
                          { key: 'genius', emoji: '🧠', label: 'Genial' },
                          { key: 'agree', emoji: '🤝', label: 'Concordo' },
                          { key: 'love', emoji: '❤️', label: 'Amei' },
                          { key: 'fire', emoji: '🔥', label: 'Top' },
                        ].map((r) => (
                          <button
                            key={r.key}
                            type="button"
                            className={`tw-react-btn ${reactions[post.id]?.[r.key]?.user_reacted ? 'reacted' : ''}`}
                            onClick={() => toggleReaction(post.id, r.key)}
                            title={r.label}
                          >
                            <span>{r.emoji}</span>
                            {reactions[post.id]?.[r.key]?.count > 0 && (
                              <span className="tw-react-count">{reactions[post.id][r.key].count}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {reactions[post.id] && Object.keys(reactions[post.id]).length > 0 && (
                      <div className="tw-react-pills">
                        {Object.entries(reactions[post.id]).map(([key, val]) => (
                          <span key={key} className={`tw-react-pill ${val.user_reacted ? 'mine' : ''}`} onClick={(e) => { e.stopPropagation(); toggleReaction(post.id, key); }}>
                            {key === 'useful' ? '💡' : key === 'genius' ? '🧠' : key === 'agree' ? '🤝' : key === 'love' ? '❤️' : '🔥'} {val.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {post.is_article && (
                    <button
                      className="tw-action tw-action-ai"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const excerpt = post.content?.slice(0, 500) || '';
                        const prompt = `Sobre o artigo "${post.title || 'sem título'}" publicado no Feed:\n\n${excerpt}\n\nExplique os pontos técnicos principais.`;
                        navigate('/chat', { state: { feedArticlePrompt: prompt } });
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      title="Perguntar à IA sobre este artigo"
                    >
                      <Icon>
                        <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" />
                        <circle cx="9" cy="10" r="1" />
                        <circle cx="15" cy="10" r="1" />
                      </Icon>
                      <span>IA</span>
                    </button>
                  )}
                  <button
                    className="tw-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      sharePost(post);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    title="Compartilhar"
                  >
                      <Icon>
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </Icon>
                    </button>
                  </div>

                  {openComments[post.id] && (
                    <div className="feed-comment-section">
                      <div className="feed-comment-sort">
                        <span>Ordenar:</span>
                        <button
                          type="button"
                          className={commentSort === 'recent' ? 'active' : ''}
                          onClick={() => setCommentSort('recent')}
                        >
                          Mais recentes
                        </button>
                        <button
                          type="button"
                          className={commentSort === 'top' ? 'active' : ''}
                          onClick={() => setCommentSort('top')}
                        >
                          Mais curtidas
                        </button>
                      </div>
                      <div className="feed-comment-input" style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Comentar"
                        value={commentInputs[post.id] || ''}
                        ref={(el) => { cmtMentionRefs.current[String(post.id)] = el; }}
                        onChange={(event) =>
                          handleCommentChange(post.id, event.target.value, event)
                        }
                        onInput={() => sendTypingIndicator(post.id)}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                      <button type="button" onClick={() => handleCommentSubmit(post.id)}>
                        Enviar
                      </button>
                      {cmtMentionKey === String(post.id) && cmtMentionResults.length > 0 && (
                        <div className="tw-mention-dropdown">
                          {cmtMentionResults.map((user, i) => renderMentionItem(user, i, cmtMentionIndex, selectCommentMention, setCmtMentionIndex))}
                        </div>
                      )}
                      </div>
                      <div className="feed-comment-list">
                        {sortCommentsTree(buildCommentTree(commentsByPost[post.id] || [])).map(
                          (comment) => renderComment(post.id, comment),
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {!focusedPost && hasMore && (
              <div ref={scrollSentinelRef} className="feed-scroll-sentinel">
                {loadingMore && <SkeletonFeed count={2} />}
              </div>
            )}
          </div>
        </section>

        <aside className="feed-column feed-right">
          <div className="feed-search">
            <form className="feed-search-bar" onSubmit={handleSearchSubmit}>
              <Icon>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </Icon>
              <input
                type="search"
                placeholder="Buscar"
                aria-label="Buscar no feed"
                value={searchTerm}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchTerm(value);
                  setSearchOpen(true);
                  if (!value.trim()) {
                    setSearchResults([]);
                    setSearchActive(false);
                  }
                }}
              />
            </form>
            {searchOpen && (
              <div className="feed-search-panel">
                {/* Modo 1: Recentes (quando não digitou nada) */}
                {!searchTerm.trim() ? (
                  <>
                    {recentSearches.length > 0 ? (
                      <div className="feed-search-section">
                        <div className="feed-search-header">
                          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Recente</span>
                          <button type="button" className="feed-search-clear" onClick={clearRecentSearches}>
                            Limpar tudo
                          </button>
                        </div>
                        <div className="feed-search-list">
                          {recentSearches.map((item) => (
                            <div key={item} className="tw-search-recent-item" onClick={() => handleRecentClick(item)}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              <span className="tw-search-recent-text">{item}</span>
                              <button type="button" className="tw-search-recent-remove" onClick={(e) => { e.stopPropagation(); removeRecentSearch(item); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="feed-empty" style={{ padding: '24px 16px', color: 'var(--text-muted)' }}>
                        Pesquise por pessoas, posts ou hashtags.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Modo 2: Resultados (quando digitou) */}
                    {searching && (
                      <div className="feed-empty" style={{ padding: 16 }}>Buscando...</div>
                    )}

                    {/* Usuários */}
                    {!searching && userResults.length > 0 && (
                      <div className="feed-search-list">
                        {userResults.map((u) => (
                          <div
                            key={u.id || u.username}
                            className="tw-search-user-item"
                            onClick={() => { setSearchOpen(false); navigate(`/profile/${u.username}`); }}
                          >
                            {u.photo ? (
                              <img src={`data:${u.photo_mime || 'image/jpeg'};base64,${u.photo}`} alt="" className="tw-search-user-avatar" />
                            ) : (
                              <div className="tw-search-user-avatar tw-search-user-avatar-placeholder">
                                {(u.name || u.username || 'U')[0].toUpperCase()}
                              </div>
                            )}
                            <div className="tw-search-user-info">
                              <span className="tw-search-user-name">{u.name || u.username}</span>
                              <span className="tw-search-user-handle">@{u.username}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Posts */}
                    {!searching && searchResults.length > 0 && (
                      <div className="feed-search-list">
                        {searchResults.map((result) => (
                          <div
                            key={result.id}
                            className="feed-search-result"
                            role="button"
                            tabIndex={0}
                            onClick={() => { setSearchOpen(false); navigate(`/feed/${result.id}`); }}
                          >
                            <div className="feed-search-meta">
                              <strong>{result.name || 'Usuario'}</strong>
                              <span>@{result.username || 'usuario'}</span>
                              <span className="tw-dot">.</span>
                              <span>{formatTime(result.created_at)}</span>
                              {result.is_article && <span className="tw-article-badge" style={{ fontSize: '0.7rem', padding: '1px 6px', marginLeft: 4 }}>Artigo</span>}
                            </div>
                            {result.is_article && result.title && (
                              <strong className="feed-search-title">{result.title}</strong>
                            )}
                            <p>{result.content?.slice(0, 120)}{result.content?.length > 120 ? '...' : ''}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!searching && searchResults.length === 0 && userResults.length === 0 && (
                      <div className="feed-empty" style={{ padding: 16 }}>Sem resultados.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
          <div className="feed-card">
            <h3>Quem seguir</h3>
            <div className="feed-follow-list">
              {suggestions.map((suggestion) => {
                const avatarSrc = buildAvatarSrc(suggestion.photo, suggestion.photo_mime, suggestion.id);
                return (
                  <div key={suggestion.id} className="feed-follow-item">
                    <div
                      className="feed-follow-avatar-wrap feed-avatar-link"
                      onClick={() => navigate(`/profile/${suggestion.id}`)}
                    >
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={suggestion.name} />
                      ) : (
                        <div className="feed-follow-avatar">
                          {suggestion.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div
                      className="feed-follow-info"
                      onClick={() => navigate(`/profile/${suggestion.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <strong>{suggestion.name || 'Usuario'}</strong>
                      <span>@{suggestion.username || 'usuario'}</span>
                    </div>
                    <button
                      className="feed-follow-btn"
                      type="button"
                      onClick={() => handleFollow(suggestion.id)}
                    >
                      {suggestion.following ? 'Seguindo' : 'Seguir'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Post da semana */}
          {postOfWeek && (
            <div className="feed-card feed-potw">
              <div className="feed-potw-header">
                <div className="feed-potw-icon-wrap">
                  <Icon width="16" height="16">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </Icon>
                </div>
                <h3>Post da Semana</h3>
              </div>
              <div className="feed-potw-body" onClick={() => navigate(`/feed/${postOfWeek.id}`)}>
                <div className="feed-potw-author">
                  <img src={buildAvatarSrc(postOfWeek.photo, postOfWeek.photo_mime, postOfWeek.user_id)} alt="" />
                  <div>
                    <strong>{postOfWeek.name}{postOfWeek.is_founder && <span className="tw-founder-badge">F</span>}</strong>
                    <span>@{postOfWeek.username}</span>
                  </div>
                </div>
                <p className="feed-potw-text">
                  {postOfWeek.title || (postOfWeek.content?.slice(0, 140) + (postOfWeek.content?.length > 140 ? '...' : ''))}
                </p>
                <div className="feed-potw-stats">
                  <span className="feed-potw-stat">
                    <Icon width="14" height="14"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" /></Icon>
                    {postOfWeek.like_count}
                  </span>
                  <span className="feed-potw-stat">
                    <Icon width="14" height="14"><path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></Icon>
                    {postOfWeek.comment_count}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Streak */}
          {streak && streak.streak > 0 && (
            <div className="feed-card feed-streak-card">
              <div className="feed-card-header">
                <span className="feed-card-title">Atividade</span>
              </div>
              <div className="feed-streak-header">
                <span className="feed-streak-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 3-7 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.5-2.5 1.5-3.5l1 1z" />
                  </svg>
                </span>
                <div>
                  <strong>{streak.streak} {streak.streak === 1 ? 'dia consecutivo' : 'dias consecutivos'}</strong>
                  <span className="feed-streak-sub">Recorde: {streak.max_streak} {streak.max_streak === 1 ? 'dia' : 'dias'}</span>
                </div>
              </div>
              <div className="feed-streak-bar">
                <div className="feed-streak-fill" style={{ width: `${Math.min((streak.streak / 7) * 100, 100)}%` }} />
              </div>
              <span className="feed-streak-goal">{streak.streak >= 7 ? 'Semana perfeita!' : `${7 - streak.streak} ${7 - streak.streak === 1 ? 'dia' : 'dias'} para a semana perfeita`}</span>
            </div>
          )}

          {/* Topico da semana */}
          <div className="feed-card feed-weekly-topic">
            <div className="feed-card-header">
              <h3>Topico da Semana</h3>
              <span className="feed-weekly-badge">Semanal</span>
            </div>
            <p className="feed-weekly-prompt">{weeklyTopic}</p>
            <button
              type="button"
              className="feed-weekly-btn"
              onClick={() => {
                setDraft(weeklyTopic + '\n\n');
                composerRef.current?.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Participar
            </button>
          </div>

        </aside>
      </div>

      {analyticsData && (
        <div className="tw-analytics-overlay" onClick={() => { setAnalyticsData(null); }}>
          <div className="tw-analytics-panel" onClick={e => e.stopPropagation()}>
            <div className="tw-analytics-header">
              <h3>Analytics do Post</h3>
              <button type="button" onClick={() => { setAnalyticsData(null); }}>x</button>
            </div>
            <div className="tw-analytics-grid">
              <div className="tw-analytics-stat">
                <span className="tw-analytics-value">{analyticsData.views}</span>
                <span className="tw-analytics-label">Visualizacoes</span>
              </div>
              <div className="tw-analytics-stat">
                <span className="tw-analytics-value">{analyticsData.likes}</span>
                <span className="tw-analytics-label">Curtidas</span>
              </div>
              <div className="tw-analytics-stat">
                <span className="tw-analytics-value">{analyticsData.comments}</span>
                <span className="tw-analytics-label">Comentarios</span>
              </div>
              <div className="tw-analytics-stat">
                <span className="tw-analytics-value">{analyticsData.reposts}</span>
                <span className="tw-analytics-label">Reposts</span>
              </div>
              <div className="tw-analytics-stat">
                <span className="tw-analytics-value">{analyticsData.engagement_rate}%</span>
                <span className="tw-analytics-label">Engajamento</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText="Excluir"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, open: false }))}
      />

      {shareToast && <div className="feed-toast">Link copiado!</div>}

      {lightbox && (
        <div className="feed-lightbox-overlay" onClick={() => setLightbox(null)}>
          <button className="feed-lightbox-close" onClick={() => setLightbox(null)}>
            <Icon><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
          </button>
          <div className="feed-lightbox-container" onClick={(e) => e.stopPropagation()}>
            {lightbox.images.length > 1 && lightbox.index > 0 && (
              <button className="feed-lightbox-nav feed-lightbox-prev" onClick={() => setLightbox(prev => ({...prev, index: prev.index - 1}))}>
                <Icon><polyline points="15 18 9 12 15 6" /></Icon>
              </button>
            )}
            <img src={buildMediaSrc(lightbox.images[lightbox.index])} alt="" className="feed-lightbox-img" />
            {lightbox.images.length > 1 && lightbox.index < lightbox.images.length - 1 && (
              <button className="feed-lightbox-nav feed-lightbox-next" onClick={() => setLightbox(prev => ({...prev, index: prev.index + 1}))}>
                <Icon><polyline points="9 18 15 12 9 6" /></Icon>
              </button>
            )}
          </div>
          {lightbox.images.length > 1 && (
            <div className="feed-lightbox-counter">{lightbox.index + 1} / {lightbox.images.length}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Feed;
