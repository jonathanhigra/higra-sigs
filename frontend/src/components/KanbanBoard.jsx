import { useState, useRef, memo } from 'react';
import './KanbanBoard.css';

/**
 * KanbanBoard — componente reutilizável equivalente ao plugin Material Kanban Board do APEX.
 *
 * Props:
 * - columns: [{ id, title, color, items: [{ id, ...data }] }]
 * - onDrop: (itemId, fromColumnId, toColumnId) => Promise — chamado ao soltar card
 * - onCardClick: (item) => void — chamado ao clicar no card
 * - renderCard: (item) => JSX — render customizado do card (opcional)
 * - dragEnabled: boolean (default true)
 */
const KanbanBoard = memo(function KanbanBoard({ columns = [], onDrop, onCardClick, renderCard, dragEnabled = true }) {
  const [, setDragItem] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const dragRef = useRef(null);

  const handleDragStart = (e, item, colId) => {
    if (!dragEnabled) return;
    setDragItem({ item, fromColId: colId });
    dragRef.current = { item, fromColId: colId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(item.id));
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    setDragItem(null);
    setDragOverCol(null);
    dragRef.current = null;
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colId);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = async (e, toColId) => {
    e.preventDefault();
    setDragOverCol(null);
    const ref = dragRef.current;
    if (!ref) return;
    const { item, fromColId } = ref;
    if (fromColId === toColId) return;
    if (onDrop) {
      await onDrop(item.id, fromColId, toColId);
    }
  };

  return (
    <div className="kanban-container">
      {columns.map(col => (
        <div key={col.id} className="kanban-col">
          <div className="kanban-col-header">
            <span className="kanban-col-dot" style={{ background: col.color || 'var(--accent)' }} />
            <span className="kanban-col-title">{col.title}</span>
            <span className="kanban-col-count">{(col.items || []).length}</span>
          </div>
          <div
            className={`kanban-col-body ${dragOverCol === col.id ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {(col.items || []).map(item => (
              <div
                key={item.id}
                className="kanban-item"
                draggable={dragEnabled}
                onDragStart={(e) => handleDragStart(e, item, col.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onCardClick?.(item)}
              >
                {renderCard ? renderCard(item) : (
                  <>
                    <div className="kanban-item-title">{item.titulo || item.title || `#${item.id}`}</div>
                    {(item.responsavel_nome || item.prioridade || item.dt_previsao) && (
                      <div className="kanban-item-meta">
                        <span>{item.responsavel_nome || ''}</span>
                        {item.prioridade && (
                          <span className={`prioridade-badge ${(item.prioridade || '').toLowerCase()}`}>
                            {item.prioridade}
                          </span>
                        )}
                      </div>
                    )}
                    {(item.responsavel_nome || item.dt_previsao) && (
                      <div className="kanban-item-footer">
                        {item.responsavel_nome && (
                          <span className="kanban-item-avatar">
                            {item.responsavel_nome[0]?.toUpperCase()}
                          </span>
                        )}
                        {item.dt_previsao && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(item.dt_previsao).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

export default KanbanBoard;
