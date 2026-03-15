"use client";

import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import VisibilityIcon from "@mui/icons-material/Visibility";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import GavelIcon from "@mui/icons-material/Gavel";
import { AuctionProductData, BidderStatus } from "@/lib/abc-auctions/types";
import BidStatusChip from "./BidStatusChip";
import CountdownTimer from "./CountdownTimer";

interface ProductCardProps {
  product: AuctionProductData;
  isWatched: boolean;
  bidderStatus?: BidderStatus;
  onWatch: () => void;
  onBid?: () => void;
  bidLoading?: boolean;
}

export default function ProductCard({
  product,
  isWatched,
  bidderStatus,
  onWatch,
  onBid,
  bidLoading = false,
}: ProductCardProps) {
  return (
    <Card
      elevation={2}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.2s",
        "&:hover": { boxShadow: 6 },
      }}
    >
      <CardMedia
        component="img"
        image={product.imageUrl || "/placeholder.png"}
        alt={product.title}
        onClick={() => window.open(product.productUrl, "_blank", "noopener,noreferrer")}
        sx={{ height: 180, objectFit: "cover", bgcolor: "grey.100", cursor: "pointer" }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/placeholder.png";
        }}
      />

      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
          <Chip label={product.category} size="small" color="secondary" sx={{ fontSize: 10 }} />
          {product.lotNumber && (
            <Typography variant="caption" color="text.disabled">
              {product.lotNumber}
            </Typography>
          )}
        </Stack>

        <Typography
          variant="subtitle2"
          fontWeight={600}
          mt={1}
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.title}
        </Typography>

        <Divider sx={{ my: 1 }} />

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack>
            <Typography variant="caption" color="text.secondary">
              Current bid
            </Typography>
            <Typography variant="body1" fontWeight={700} color="primary">
              ${product.currentPrice.toLocaleString()}
            </Typography>
          </Stack>
          <Stack alignItems="flex-end">
            <Typography variant="caption" color="text.secondary">
              Max price
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              ${product.maxPrice.toLocaleString()}
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
          <Typography variant="caption" color="text.secondary">
            Closes in
          </Typography>
          <CountdownTimer auctionEndTime={product.auctionEndTime} />
        </Stack>
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {isWatched && bidderStatus && <BidStatusChip status={bidderStatus} />}
          <Button
            size="small"
            variant="text"
            startIcon={<OpenInNewIcon fontSize="small" />}
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            color="inherit"
          >
            View
          </Button>
        </Stack>
        <Button
          size="small"
          variant={isWatched ? "outlined" : "contained"}
          startIcon={<VisibilityIcon />}
          onClick={onWatch}
          color="primary"
        >
          {isWatched ? "Watching" : "Watch"}
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={bidLoading ? <CircularProgress size={14} color="inherit" /> : <GavelIcon />}
          onClick={onBid}
          disabled={bidLoading || !onBid}
        >
          {bidLoading ? "Bidding…" : "Bid"}
        </Button>
      </CardActions>
    </Card>
  );
}
