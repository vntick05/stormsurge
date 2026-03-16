import { useState } from 'react';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import HolderOutlined from '@ant-design/icons/HolderOutlined';

import MainCard from 'components/MainCard';

const initialRequirementCards = [
  { id: '3.1.p6', title: 'Technical Support Requirement' },
  { id: '3.1.p11', title: 'ArcGIS Earth Client Support' },
  { id: '3.2.p2', title: 'Operational Availability Monitoring' },
  { id: '3.2.p7', title: 'Integrated Data Source Validation' },
  { id: '4.1.p3', title: 'Software Enhancement Delivery' },
  { id: '5.4.p2', title: 'Monthly Status And Risk Reporting' },
  { id: '6.2.p4', title: 'Vulnerability Response Workflow' },
  { id: '7.1.p1', title: 'Transition Knowledge Transfer Plan' }
];

function RequirementCard({ requirement, isSelected, isDragging, isDragTarget, onSelect, dragProps }) {
  return (
    <Box
      {...dragProps}
      sx={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.45 : 1,
        transform: isDragging ? 'scale(0.99)' : 'scale(1)',
        transition: 'transform 160ms ease, opacity 160ms ease'
      }}
    >
      <MainCard
        contentSX={{ p: 1.75 }}
        onClick={onSelect}
        sx={{
          borderRadius: 2,
          cursor: 'pointer',
          bgcolor: isSelected ? 'primary.lighter' : 'background.paper',
          boxShadow: isSelected ? '0 0 0 1px rgba(70, 95, 255, 0.24)' : undefined,
          outline: isDragTarget ? '1px dashed rgba(70, 95, 255, 0.4)' : 'none',
          '&:hover': {
            bgcolor: isSelected ? 'primary.lighter' : 'grey.50'
          }
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '18px max-content minmax(0, 1fr)' },
            columnGap: 1,
            rowGap: 0.5,
            alignItems: 'center'
          }}
        >
          <Box
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              alignItems: 'center',
              justifyContent: 'center',
              color: isSelected ? 'primary.main' : 'text.disabled'
            }}
          >
            <HolderOutlined style={{ fontSize: '0.8rem' }} />
          </Box>
          <Typography
            variant="body1"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}
          >
            {requirement.id}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.primary' }}>
            {requirement.title}
          </Typography>
        </Box>
      </MainCard>
    </Box>
  );
}

export default function DashboardDefault() {
  const [requirementCards, setRequirementCards] = useState(initialRequirementCards);
  const [selectedId, setSelectedId] = useState(initialRequirementCards[0].id);
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);

  const moveCard = (activeId, targetId) => {
    if (!activeId || !targetId || activeId === targetId) return;

    setRequirementCards((currentCards) => {
      const activeIndex = currentCards.findIndex((card) => card.id === activeId);
      const targetIndex = currentCards.findIndex((card) => card.id === targetId);

      if (activeIndex === -1 || targetIndex === -1) return currentCards;

      const nextCards = [...currentCards];
      const [movedCard] = nextCards.splice(activeIndex, 1);
      nextCards.splice(targetIndex, 0, movedCard);
      return nextCards;
    });
  };

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack sx={{ gap: 1.25 }}>
        {requirementCards.map((requirement) => (
          <RequirementCard
            key={requirement.id}
            requirement={requirement}
            isSelected={selectedId === requirement.id}
            isDragging={draggedId === requirement.id}
            isDragTarget={dragTargetId === requirement.id && draggedId !== requirement.id}
            onSelect={() => setSelectedId(requirement.id)}
            dragProps={{
              draggable: true,
              onDragStart: () => {
                setDraggedId(requirement.id);
                setSelectedId(requirement.id);
              },
              onDragEnter: (event) => {
                event.preventDefault();
                setDragTargetId(requirement.id);
                moveCard(draggedId || requirement.id, requirement.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
              },
              onDrop: () => {
                moveCard(draggedId, requirement.id);
                setDragTargetId(null);
                setDraggedId(null);
              },
              onDragEnd: () => {
                setDragTargetId(null);
                setDraggedId(null);
              }
            }}
          />
        ))}
      </Stack>
    </Stack>
  );
}
