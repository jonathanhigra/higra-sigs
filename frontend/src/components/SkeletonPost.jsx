import React from 'react';
import './Skeleton.css';

const SkeletonPost = () => (
  <div className="skeleton-post">
    <div className="skeleton-header">
      <div className="skeleton-avatar skeleton-pulse" />
      <div className="skeleton-meta">
        <div className="skeleton-line skeleton-pulse" style={{ width: '120px' }} />
        <div className="skeleton-line skeleton-pulse" style={{ width: '80px', height: '10px' }} />
      </div>
    </div>
    <div className="skeleton-body">
      <div className="skeleton-line skeleton-pulse" style={{ width: '100%' }} />
      <div className="skeleton-line skeleton-pulse" style={{ width: '90%' }} />
      <div className="skeleton-line skeleton-pulse" style={{ width: '60%' }} />
    </div>
    <div className="skeleton-actions">
      <div className="skeleton-action skeleton-pulse" />
      <div className="skeleton-action skeleton-pulse" />
      <div className="skeleton-action skeleton-pulse" />
      <div className="skeleton-action skeleton-pulse" />
    </div>
  </div>
);

export const SkeletonFeed = ({ count = 3 }) => (
  <div className="skeleton-feed">
    {Array.from({ length: count }, (_, i) => (
      <SkeletonPost key={i} />
    ))}
  </div>
);

export const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-line skeleton-pulse" style={{ width: '70%', height: '16px' }} />
    <div className="skeleton-line skeleton-pulse" style={{ width: '100%' }} />
    <div className="skeleton-line skeleton-pulse" style={{ width: '40%', height: '10px' }} />
  </div>
);

export default SkeletonPost;
