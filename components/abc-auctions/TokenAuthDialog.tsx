"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";

interface TokenInfo {
  hasToken: boolean;
  expiresAt?: string;
  expiresInHours?: number;
  isExpired?: boolean;
}

interface TokenAuthDialogProps {
  open?: boolean;
  onClose?: () => void;
  isModal?: boolean;
}

export default function TokenAuthDialog({
  open: initialOpen = false,
  onClose,
  isModal = true,
}: TokenAuthDialogProps) {
  const [open, setOpen] = useState(initialOpen);
  const [token, setToken] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  // Fetch current token info on mount/open
  useEffect(() => {
    if (open && isModal) {
      fetchTokenInfo();
    }
  }, [open, isModal]);

  // Auto-fetch on mount if not a modal
  useEffect(() => {
    if (!isModal) {
      fetchTokenInfo();
    }
  }, [isModal]);

  async function fetchTokenInfo() {
    setFetching(true);
    try {
      const res = await fetch("/api/abc-auctions/auth/token");
      const data = await res.json();
      setTokenInfo(data);
    } catch (err) {
      console.error("Failed to fetch token info", err);
      setMessage({
        type: "error",
        text: "Failed to load token information",
      });
    } finally {
      setFetching(false);
    }
  }

  async function handleSaveToken() {
    if (!token.trim()) {
      setMessage({
        type: "error",
        text: "Token cannot be empty",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/abc-auctions/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "Failed to save token",
        });
        return;
      }

      setMessage({
        type: "success",
        text: `Token saved successfully! Expires in ${data.expiresInHours || 0} hours.`,
      });
      setToken("");
      await fetchTokenInfo();

      // Auto-close modal on success after a delay
      if (isModal) {
        setTimeout(() => {
          handleClose();
        }, 2000);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Failed to save token",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleClearToken() {
    setLoading(true);
    try {
      const res = await fetch("/api/abc-auctions/auth/token", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "Failed to clear token",
        });
        return;
      }

      setMessage({
        type: "success",
        text: "Token cleared successfully",
      });
      setToken("");
      await fetchTokenInfo();
    } catch (err) {
      setMessage({
        type: "error",
        text: "Failed to clear token",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setMessage(null);
    setToken("");
    onClose?.();
  }

  const content = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Token Status */}
      <Paper
        sx={{
          p: 2,
          backgroundColor: fetching
            ? "rgba(0, 0, 0, 0.02)"
            : tokenInfo?.isExpired
              ? "rgba(255, 152, 0, 0.08)"
              : tokenInfo?.hasToken
                ? "rgba(76, 175, 80, 0.08)"
                : "rgba(244, 67, 54, 0.08)",
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            {fetching ? (
              <>
                <CircularProgress size={20} />
                <Typography>Loading token status...</Typography>
              </>
            ) : tokenInfo?.isExpired ? (
              <>
                <WarningIcon sx={{ color: "warning.main" }} />
                <Typography fontWeight={600} color="warning.main">
                  Token Expired
                </Typography>
              </>
            ) : tokenInfo?.hasToken ? (
              <>
                <CheckCircleIcon sx={{ color: "success.main" }} />
                <Typography fontWeight={600} color="success.main">
                  Token Active
                </Typography>
              </>
            ) : (
              <>
                <ErrorIcon sx={{ color: "error.main" }} />
                <Typography fontWeight={600} color="error.main">
                  No Token
                </Typography>
              </>
            )}
          </Stack>

          {!fetching && tokenInfo?.hasToken && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                Expires: {tokenInfo.expiresAt ? new Date(tokenInfo.expiresAt).toLocaleString() : "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Time remaining: {tokenInfo.expiresInHours ? `${tokenInfo.expiresInHours.toFixed(1)} hours` : "—"}
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      {/* Messages */}
      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Token Input */}
      <Box>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          Paste JWT Token
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={4}
          placeholder="Paste your JWT token here (with or without 'Bearer ' prefix)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={loading}
          variant="outlined"
          sx={{
            "& .MuiOutlinedInput-root": {
              fontFamily: "monospace",
              fontSize: "0.875rem",
            },
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Your token is stored securely and used only for authentication with ABC Auctions. It will not be transmitted to any external services.
        </Typography>
      </Box>

      {/* Instructions */}
      <Paper sx={{ p: 2, backgroundColor: "rgba(33, 150, 243, 0.08)" }}>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          How to get your token:
        </Typography>
        <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "0.875rem" }}>
          <li>Log in to ABC Auctions manually</li>
          <li>Open DevTools (F12) → Applications/Storage → Cookies</li>
          <li>Look for a JWT or auth token in your browser storage</li>
          <li>Paste it above</li>
        </ol>
      </Paper>
    </Box>
  );

  if (!isModal) {
    // Page view
    return (
      <Box sx={{ maxWidth: 600, mx: "auto" }}>
        <Typography variant="h5" fontWeight={700} mb={3}>
          ABC Auctions Authentication
        </Typography>
        {content}

        {tokenInfo?.hasToken && !tokenInfo.isExpired && (
          <Stack direction="row" spacing={2} mt={3}>
            <Button
              variant="contained"
              disabled={loading}
              onClick={handleClearToken}
              color="error"
            >
              {loading ? <CircularProgress size={20} /> : "Clear Token"}
            </Button>
          </Stack>
        )}

        {(!tokenInfo?.hasToken || tokenInfo?.isExpired) && (
          <Button
            variant="contained"
            fullWidth
            disabled={!token.trim() || loading}
            onClick={handleSaveToken}
            sx={{ mt: 3 }}
          >
            {loading ? <CircularProgress size={20} /> : "Save Token"}
          </Button>
        )}
      </Box>
    );
  }

  // Modal view
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>ABC Auctions Authentication</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>{content}</DialogContent>
      <DialogActions>
        {tokenInfo?.hasToken && !tokenInfo.isExpired && (
          <Button
            color="error"
            onClick={handleClearToken}
            disabled={loading}
          >
            Clear Token
          </Button>
        )}
        <Button onClick={handleClose} disabled={loading}>
          Close
        </Button>
        {(!tokenInfo?.hasToken || tokenInfo?.isExpired) && (
          <Button
            variant="contained"
            onClick={handleSaveToken}
            disabled={!token.trim() || loading}
          >
            {loading ? <CircularProgress size={20} /> : "Save Token"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
