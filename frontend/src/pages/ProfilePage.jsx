import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import SettingsModal from '../components/SettingsModal';
import FollowListModal from '../components/FollowListModal';
import AvatarUploadModal from '../components/AvatarUploadModal';
import CoverUploadModal from '../components/CoverUploadModal';
import { SkeletonFeed } from '../components/SkeletonPost';
import api from '../lib/api';
import Icon from '../components/Icon';
import { formatTime } from '../lib/dateUtils';
import './ProfilePage.css';

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'articles', label: 'Artigos' },
  { key: 'media', label: 'Midia' },
  { key: 'likes', label: 'Curtidas' },
  { key: 'achievements', label: 'Conquistas' },
];

const avatarBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SkeletonProfile = () => (
  <div className="profile-page">
    <div className="profile-hero">
      <div className="skeleton-pulse" style={{ width: '100%', height: '200px', background: 'var(--bg-tertiary, #2f3336)' }} />
    </div>
    <div className="profile-body">
      <div className="profile-avatar-row">
        <div className="profile-avatar">
          <div className="skeleton-pulse" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
        </div>
      </div>
      <div className="profile-info">
        <div className="skeleton-line skeleton-pulse" style={{ width: '160px', height: '20px', marginBottom: '8px' }} />
        <div className="skeleton-line skeleton-pulse" style={{ width: '100px', height: '14px', marginBottom: '12px' }} />
        <div className="skeleton-line skeleton-pulse" style={{ width: '80%', height: '14px', marginBottom: '8px' }} />
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
          <div className="skeleton-line skeleton-pulse" style={{ width: '80px', height: '14px' }} />
          <div className="skeleton-line skeleton-pulse" style={{ width: '80px', height: '14px' }} />
        </div>
      </div>
      <div className="profile-tabs">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" style={{ opacity: 0.3 }}>{tab.label}</button>
        ))}
      </div>
      <div className="profile-posts">
        <SkeletonFeed count={3} />
      </div>
    </div>
  </div>
);

const ProfilePage = () => {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [posts, setPosts] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [followListMode, setFollowListMode] = useState(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [milestones, setMilestones] = useState(null);
  const tabCacheRef = useRef({ posts: null, articles: null, media: null, likes: null });

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const { data: me } = await api.get('/auth/me');
      const targetId = userId ? Number(userId) : me.id;
      const own = targetId === me.id;
      setIsOwnProfile(own);
      setIsAdmin(!!me.is_admin);

      // Load profile + initial posts in parallel
      const postsUrl = `/social/users/${targetId}/posts`;
      if (own) {
        const [{ data: stats }, { data: postsData }] = await Promise.all([
          api.get('/social/profile/stats'),
          api.get(postsUrl),
        ]);
        const profileData = {
          id: me.id,
          name: me.name,
          username: me.username,
          photo: me.photo,
          photo_mime: me.photo_mime,
          bio: me.bio || '',
          cover_photo: me.cover_photo,
          cover_photo_mime: me.cover_photo_mime,
          created_at: me.created_at,
          is_founder: me.is_founder,
          is_ai: me.is_ai,
          post_count: stats.posts,
          following_count: stats.following,
          follower_count: stats.followers,
          is_following: false,
        };
        setProfile(profileData);
        const allPosts = postsData.posts || [];
        tabCacheRef.current.posts = allPosts.filter((p) => !p.is_article);
        tabCacheRef.current.articles = allPosts.filter((p) => p.is_article);
        const images = [];
        allPosts.forEach((p) => {
          if (Array.isArray(p.media)) {
            p.media.forEach((m) => {
              if (m.type?.startsWith('image') || m.url?.match(/\.(png|jpg|jpeg|gif|webp)/i)) {
                images.push({ ...m, postId: p.id });
              }
            });
          }
        });
        tabCacheRef.current.media = images;
        setPosts(tabCacheRef.current.posts);
      } else {
        const [{ data }, { data: postsData }] = await Promise.all([
          api.get(`/social/users/${targetId}/profile`),
          api.get(postsUrl),
        ]);
        setProfile(data.profile);
        const allPosts = postsData.posts || [];
        tabCacheRef.current.posts = allPosts.filter((p) => !p.is_article);
        tabCacheRef.current.articles = allPosts.filter((p) => p.is_article);
        const images = [];
        allPosts.forEach((p) => {
          if (Array.isArray(p.media)) {
            p.media.forEach((m) => {
              if (m.type?.startsWith('image') || m.url?.match(/\.(png|jpg|jpeg|gif|webp)/i)) {
                images.push({ ...m, postId: p.id });
              }
            });
          }
        });
        tabCacheRef.current.media = images;
        setPosts(tabCacheRef.current.posts);
      }
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [userId]);

  const fetchPosts = useCallback(async (tab) => {
    if (!profile) return;

    // Use cache for posts/articles/media (pre-loaded in fetchProfile)
    if (tab !== 'likes' && tabCacheRef.current[tab] !== null) {
      if (tab === 'media') {
        setMediaItems(tabCacheRef.current.media);
        setPosts([]);
      } else {
        setMediaItems([]);
        setPosts(tabCacheRef.current[tab]);
      }
      return;
    }

    // Likes tab: fetch on demand, then cache
    setPostsLoading(true);
    try {
      const { data } = await api.get(`/social/users/${profile.id}/likes`);
      const items = data.posts || [];
      tabCacheRef.current.likes = items;
      setMediaItems([]);
      setPosts(items);
    } catch (err) {
      console.error('Erro ao carregar posts:', err);
      setPosts([]);
      setMediaItems([]);
    } finally {
      setPostsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    tabCacheRef.current = { posts: null, articles: null, media: null, likes: null };
    setProfile(null);
    setProfileLoading(true);
    setPosts([]);
    setMediaItems([]);
    setActiveTab('posts');
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!profile) return;
    if (activeTab === 'achievements') {
      if (!milestones) {
        api.get('/social/milestones').then(({ data }) => setMilestones(data)).catch(() => {});
      }
    } else {
      fetchPosts(activeTab);
    }
  }, [activeTab, fetchPosts, profile]);

  const handleFollow = async () => {
    if (!profile || followLoading) return;
    const prevFollowing = profile.is_following;
    const prevCount = profile.follower_count;
    // Optimistic update
    setProfile((p) => ({
      ...p,
      is_following: !p.is_following,
      follower_count: p.is_following ? Math.max(0, p.follower_count - 1) : p.follower_count + 1,
    }));
    setFollowLoading(true);
    try {
      await api.post(`/social/users/${profile.id}/follow`);
    } catch (err) {
      // Revert on error
      setProfile((p) => ({ ...p, is_following: prevFollowing, follower_count: prevCount }));
      console.error('Erro ao seguir/desseguir:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const avatarSrc = profile?.photo
    ? `data:${profile.photo_mime || 'image/jpeg'};base64,${profile.photo}`
    : profile?.id ? `${avatarBase}/social/avatar/${profile.id}` : null;

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '';


  const coverSrc = profile?.cover_photo
    ? `data:${profile.cover_photo_mime || 'image/jpeg'};base64,${profile.cover_photo}`
    : '/assets/bg.jpeg';

  // Admin pode editar qualquer perfil
  const canEdit = isOwnProfile || isAdmin;

  if (profileLoading && !profile) {
    return <SkeletonProfile />;
  }

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <img
          className="profile-cover"
          src={coverSrc}
          alt="Capa do perfil"
        />
        <button className="profile-back" type="button" onClick={() => navigate(-1)}>
          <Icon width="20" height="20">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </Icon>
        </button>
        {canEdit && (
          <button
            className="profile-cover-edit"
            type="button"
            onClick={() => setCoverModalOpen(true)}
            title="Alterar capa"
          >
            <Icon width="16" height="16">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </Icon>
          </button>
        )}
      </div>

      <div className="profile-body">
        <div className="profile-avatar-row">
          <div className="profile-avatar">
            {avatarSrc ? (
              <img src={avatarSrc} alt={profile?.name || 'Perfil'} />
            ) : (
              <span>{(profile?.name || 'U')[0]?.toUpperCase()}</span>
            )}
            {canEdit && (
              <button
                className="profile-avatar-edit"
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                title="Alterar foto"
              >
                <Icon width="20" height="20">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </Icon>
              </button>
            )}
          </div>
          <div className="profile-action-buttons">
            {!isOwnProfile && (
              <button
                className={`profile-follow-btn ${profile?.is_following ? 'following' : ''}`}
                type="button"
                onClick={handleFollow}
                disabled={followLoading}
              >
                {profile?.is_following ? 'Seguindo' : 'Seguir'}
              </button>
            )}
            {canEdit && (
              <button className="profile-edit-btn" type="button" onClick={() => setSettingsOpen(true)}>
                {isOwnProfile ? 'Editar perfil' : 'Editar usuario'}
              </button>
            )}
          </div>
        </div>

        <div className="profile-info">
          <h2>
            {profile?.name || 'Usuario'}
            {profile?.is_founder && <span className="profile-founder-badge">Fundador</span>}
            {profile?.is_ai && <span className="profile-ai-badge">IA</span>}
          </h2>
          <div className="profile-handle">@{profile?.username || 'usuario'}</div>
          {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
          <div className="profile-meta">
            {joinedDate && (
              <span className="profile-meta-item">
                <Icon width="15" height="15">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </Icon>
                Ingressou em {joinedDate}
              </span>
            )}
          </div>
          <div className="profile-stats">
            <span className="profile-stat-link" onClick={() => setFollowListMode('following')}>
              <strong>{profile?.following_count ?? 0}</strong> Seguindo
            </span>
            <span className="profile-stat-link" onClick={() => setFollowListMode('followers')}>
              <strong>{profile?.follower_count ?? 0}</strong> Seguidores
            </span>
          </div>
        </div>

        <div className="profile-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="profile-posts">
          {activeTab === 'achievements' ? (
            <div className="profile-achievements">
              {!milestones ? (
                <div className="profile-posts-empty">Carregando...</div>
              ) : (
                <>
                  <div className="profile-ach-summary">
                    <div className="profile-ach-progress-ring">
                      <svg viewBox="0 0 36 36" width="64" height="64">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--feed-border, #26262b)" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke="#1d9bf0" strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={`${(milestones.milestones.filter((m) => m.achieved).length / milestones.milestones.length) * 100} 100`}
                          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                        />
                      </svg>
                      <span className="profile-ach-ring-text">
                        {milestones.milestones.filter((m) => m.achieved).length}/{milestones.milestones.length}
                      </span>
                    </div>
                    <div className="profile-ach-summary-text">
                      <strong>{milestones.milestones.filter((m) => m.achieved).length} conquistas desbloqueadas</strong>
                      <span>de {milestones.milestones.length} disponiveis</span>
                    </div>
                  </div>
                  <div className="profile-ach-grid">
                    {milestones.milestones.map((m) => (
                      <div key={m.key} className={`profile-ach-item ${m.achieved ? 'achieved' : 'locked'}`}>
                        <div className="profile-ach-icon">
                          {m.icon === 'pen' && <Icon width="20" height="20"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></Icon>}
                          {m.icon === 'fire' && <Icon width="20" height="20"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 3.5-7.5C14 5 16 6 16 8a4 4 0 0 1-8 6.5" /><path d="M12 22c4-2.5 6-5 6-8a6 6 0 1 0-12 0c0 3 2 5.5 6 8z" /></Icon>}
                          {m.icon === 'star' && <Icon width="20" height="20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Icon>}
                          {m.icon === 'heart' && <Icon width="20" height="20"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" /></Icon>}
                          {m.icon === 'trophy' && <Icon width="20" height="20"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" /><path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></Icon>}
                          {m.icon === 'users' && <Icon width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>}
                          {m.icon === 'flame' && <Icon width="20" height="20"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 3.5-7.5C14 5 16 6 16 8a4 4 0 0 1-8 6.5" /><path d="M12 22c4-2.5 6-5 6-8a6 6 0 1 0-12 0c0 3 2 5.5 6 8z" /></Icon>}
                        </div>
                        <div className="profile-ach-info">
                          <span className="profile-ach-label">{m.label}</span>
                          {m.achieved && (
                            <span className="profile-ach-check">
                              <Icon width="14" height="14"><polyline points="20 6 9 17 4 12" /></Icon>
                              Desbloqueada
                            </span>
                          )}
                          {!m.achieved && <span className="profile-ach-locked-label">Bloqueada</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : postsLoading ? (
            <SkeletonFeed count={3} />
          ) : activeTab === 'media' ? (
            mediaItems.length === 0 ? (
              <div className="profile-posts-empty">Nenhuma midia ainda.</div>
            ) : (
              <div className="profile-media-grid">
                {mediaItems.map((m, i) => (
                  <Link to={`/feed/${m.postId}`} key={i} className="profile-media-item">
                    <img src={m.url} alt="" />
                  </Link>
                ))}
              </div>
            )
          ) : posts.length === 0 ? (
            <div className="profile-posts-empty">
              {activeTab === 'likes' ? 'Nenhuma curtida ainda.' :
               activeTab === 'articles' ? 'Nenhum artigo publicado.' :
               'Nenhum post ainda.'}
            </div>
          ) : (
            posts.map((post) => {
              const postAvatar = post.photo
                ? `data:${post.photo_mime || 'image/jpeg'};base64,${post.photo}`
                : post.user_id ? `${avatarBase}/social/avatar/${post.user_id}` : null;
              return (
                <Link
                  to={`/feed/${post.id}`}
                  key={post.id}
                  className="profile-post-card"
                >
                  <div className="profile-post-header">
                    <div className="profile-post-avatar">
                      {postAvatar ? (
                        <img src={postAvatar} alt="" />
                      ) : (
                        <span>{(post.name || 'U')[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="profile-post-author">
                      <strong>{post.name}</strong>
                      <span className="profile-post-handle">@{post.username}</span>
                      <span className="profile-post-dot">&middot;</span>
                      <span className="profile-post-time">{formatTime(post.created_at)}</span>
                    </div>
                  </div>
                  {post.title && <div className="profile-post-title">{post.title}</div>}
                  {post.is_article && <span className="profile-article-badge">Artigo</span>}
                  <div className="profile-post-content">
                    {post.content?.length > 280
                      ? post.content.slice(0, 280) + '...'
                      : post.content}
                  </div>
                  <div className="profile-post-footer">
                    <span className="profile-post-action">
                      <Icon width="15" height="15">
                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      </Icon>
                      {post.comment_count || 0}
                    </span>
                    <span className={`profile-post-action ${post.liked ? 'liked' : ''}`}>
                      <Icon width="15" height="15">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" />
                      </Icon>
                      {post.like_count || 0}
                    </span>
                    {post.view_count > 0 && (
                      <span className="profile-post-action">
                        <Icon width="15" height="15">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </Icon>
                        {post.view_count}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {canEdit && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            fetchProfile();
          }}
          targetUserId={isOwnProfile ? null : profile?.id}
        />
      )}

      <FollowListModal
        open={!!followListMode}
        onClose={() => setFollowListMode(null)}
        userId={profile?.id}
        mode={followListMode}
      />

      {canEdit && (
        <>
          <AvatarUploadModal
            open={avatarModalOpen}
            currentSrc={avatarSrc}
            onClose={() => setAvatarModalOpen(false)}
            onSaved={() => {
              setAvatarModalOpen(false);
              fetchProfile();
            }}
            targetUserId={isOwnProfile ? null : profile?.id}
          />
          <CoverUploadModal
            open={coverModalOpen}
            currentSrc={coverSrc}
            onClose={() => setCoverModalOpen(false)}
            onSaved={() => {
              setCoverModalOpen(false);
              fetchProfile();
            }}
            targetUserId={isOwnProfile ? null : profile?.id}
          />
        </>
      )}
    </div>
  );
};

export default ProfilePage;
