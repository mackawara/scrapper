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
import GavelIcon from "@mui/icons-material/Gavel";
import { AuctionProductData, BidderStatus } from "@/lib/abc-auctions/types";
import BidStatusChip from "./BidStatusChip";
import CountdownTimer from "./CountdownTimer";

interface ProductCardProps {
  product: AuctionProductData;
  isWatched: boolean;
  isWishlistMatch?: boolean;
  bidderStatus?: BidderStatus;
  onWatch: () => void;
  onBid?: () => void;
  bidLoading?: boolean;
}

export default function ProductCard({
  product,
  isWatched,
  isWishlistMatch = false,
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
        borderWidth: isWishlistMatch ? 2 : 0,
        borderStyle: isWishlistMatch ? "solid" : "none",
        borderColor: isWishlistMatch ? "warning.main" : "transparent",
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

      <CardContent sx={{ flexGrow: 1, pb: 1, pt: 1 }}>
        <Stack direction="row" justifyContent="center" alignItems="center" mb={0.5}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" justifyContent="center">
            {isWishlistMatch && (
              <Chip
                label="Wish Match"
                size="small"
                color="warning"
                sx={{ fontSize: 10, fontWeight: 700 }}
              />
            )}
            <Chip label={product.category} size="small" color="secondary" sx={{ fontSize: 10 }} />
          </Stack>
        </Stack>

        <Typography
          variant="subtitle2"
          fontWeight={600}
          mt={0}
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {product.title}
        </Typography>

        <Divider sx={{ my: 1 }} />

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack>
            <Typography variant="body1" fontWeight={700} color="primary">
              Current bid: ${product.currentPrice.toLocaleString()}
            </Typography>
          </Stack>
          <Stack alignItems="flex-end">
            <Typography variant="body2" fontWeight={600}>
              Max bid: ${product.maxPrice.toLocaleString()}
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

      <CardActions
        sx={{ px: 2, pb: 2, pt: 0, flexDirection: "column", alignItems: "stretch", gap: 1 }}
      >
        {isWatched && bidderStatus && <BidStatusChip status={bidderStatus} />}
        <Stack direction="row" spacing={1}>
          <Button
            fullWidth
            size="small"
            variant={isWatched ? "outlined" : "contained"}
            startIcon={<VisibilityIcon />}
            onClick={onWatch}
            color="primary"
          >
            {isWatched ? "Watching" : "Watch"}
          </Button>
          <Button
            fullWidth
            size="small"
            variant="contained"
            color="secondary"
            startIcon={bidLoading ? <CircularProgress size={14} color="inherit" /> : <GavelIcon />}
            onClick={onBid}
            disabled={bidLoading || !onBid}
          >
            {bidLoading ? "Bidding…" : "Bid"}
          </Button>
        </Stack>
      </CardActions>
    </Card>
  );
}
