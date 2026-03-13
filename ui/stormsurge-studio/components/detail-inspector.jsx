"use client";

import {
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

export function DetailInspector({
  section,
  requirement,
  sections,
  onCreateChildRequirement,
  onRequirementChange,
  onAssignToSection,
  onMoveRequirement,
  onMoveToUnassigned,
  onPromoteRequirement,
  onDemoteRequirement,
}) {
  if (!requirement) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Inspector
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Select a node in the hierarchy to inspect and edit it.
        </Typography>
      </Paper>
    );
  }

  const sectionLabel =
    requirement.sectionId === "unassigned"
      ? "Unassigned"
      : sections.find((entry) => entry.id === requirement.sectionId)?.label || "Unknown";

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Inspector
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {requirement.title}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={requirement.kind} />
            <Chip label={requirement.sourceType} variant="outlined" />
            <Chip label={sectionLabel} color="primary" variant="outlined" />
          </Stack>
          <TextField
            label="Requirement title"
            fullWidth
            value={requirement.title}
            onChange={(event) => onRequirementChange("title", event.target.value)}
          />
          <TextField
            label="Working text"
            fullWidth
            multiline
            minRows={8}
            value={requirement.text}
            onChange={(event) => onRequirementChange("text", event.target.value)}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Hierarchy Controls
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={onCreateChildRequirement}>
              Add child
            </Button>
            <Button variant="outlined" onClick={onPromoteRequirement}>
              Promote
            </Button>
            <Button variant="outlined" onClick={onDemoteRequirement}>
              Demote
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" onClick={() => onMoveRequirement("up")}>
              Move up
            </Button>
            <Button variant="outlined" onClick={() => onMoveRequirement("down")}>
              Move down
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Section Controls
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The active tab is <strong>{section?.label || "None"}</strong>. Send the selected
            node into that tab or move it back to the holding area.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" color="secondary" onClick={onAssignToSection}>
              Move to active tab
            </Button>
            <Button variant="outlined" onClick={onMoveToUnassigned}>
              Send to holding area
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Provenance
          </Typography>
          <TextField
            label="Source reference"
            fullWidth
            value={requirement.sourceRef || ""}
            onChange={(event) => onRequirementChange("sourceRef", event.target.value)}
          />
          <TextField
            select
            label="Intent"
            fullWidth
            value={requirement.intent}
            onChange={(event) => onRequirementChange("intent", event.target.value)}
          >
            {[
              "Extracted paragraph",
              "Extracted section",
              "Extracted bullet",
              "Service continuity",
              "Engineering delivery",
              "Draft",
              "Sub-requirement",
            ].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>
    </Stack>
  );
}
