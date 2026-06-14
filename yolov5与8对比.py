import csv

import matplotlib.pyplot as plt
from matplotlib import font_manager


CSV1 = r"D:\Downloads\results-yolov5.csv"
CSV2 = r"D:\Downloads\results-yolov8.csv"


def configure_chinese_font():
	available_fonts = {font.name for font in font_manager.fontManager.ttflist}
	for font_name in ["Microsoft YaHei", "SimHei", "SimSun", "NSimSun", "KaiTi", "Arial Unicode MS"]:
		if font_name in available_fonts:
			plt.rcParams["font.sans-serif"] = [font_name]
			break
	plt.rcParams["axes.unicode_minus"] = False


def load_metric_series(csv_path, x_col, y_col):
	series = []
	with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
		reader = csv.DictReader(file)
		for row in reader:
			normalized = {
				key.strip(): value.strip()
				for key, value in row.items()
				if key is not None and value is not None
			}
			if x_col not in normalized or y_col not in normalized:
				continue
			if not normalized[x_col] or not normalized[y_col]:
				continue
			x_value = int(float(normalized[x_col]))
			y_value = float(normalized[y_col])
			series.append((x_value, y_value))
	series.sort(key=lambda item: item[0])
	return series


def align_series(series_1, series_2):
	dict_1 = dict(series_1)
	dict_2 = dict(series_2)
	common_x = sorted(set(dict_1) & set(dict_2))
	values_1 = [dict_1[x] for x in common_x]
	values_2 = [dict_2[x] for x in common_x]
	diff = [b - a for a, b in zip(values_1, values_2)]
	return common_x, values_1, values_2, diff


def plot_compare(title, x_values, values_1, values_2, label_1, label_2):
	plt.figure(figsize=(10, 5))
	plt.plot(x_values, values_1, marker="o", linewidth=2, label=label_1)
	plt.plot(x_values, values_2, marker="o", linewidth=2, label=label_2)
	plt.xlabel("epoch")
	plt.ylabel(title)
	plt.title(title)
	plt.legend()
	plt.grid(True, alpha=0.3)
	plt.tight_layout()
	plt.show()


def main():
	configure_chinese_font()

	label_1 = "YOLOv5"
	label_2 = "YOLOv8"

	v5_recall = load_metric_series(CSV1, "epoch", "metrics/recall")
	v8_recall = load_metric_series(CSV2, "epoch", "metrics/recall(B)")
	v5_map50 = load_metric_series(CSV1, "epoch", "metrics/mAP_0.5")
	v8_map50 = load_metric_series(CSV2, "epoch", "metrics/mAP50(B)")
	v5_map5095 = load_metric_series(CSV1, "epoch", "metrics/mAP_0.5:0.95")
	v8_map5095 = load_metric_series(CSV2, "epoch", "metrics/mAP50-95(B)")

	x_recall, y5_recall, y8_recall, diff_recall = align_series(v5_recall, v8_recall)
	x_50, y5_50, y8_50, diff_50 = align_series(v5_map50, v8_map50)
	x_5095, y5_5095, y8_5095, diff_5095 = align_series(v5_map5095, v8_map5095)

	plot_compare("Recall 对比", x_recall, y5_recall, y8_recall, label_1, label_2)
	plot_compare("mAP50 对比", x_50, y5_50, y8_50, label_1, label_2)
	plot_compare("mAP50-95 对比", x_5095, y5_5095, y8_5095, label_1, label_2)

	plt.figure(figsize=(10, 4))
	plt.plot(x_recall, diff_recall, marker="o", linewidth=2, label="YOLOv8 - YOLOv5")
	plt.axhline(0, color="gray", linestyle="--", linewidth=1)
	plt.xlabel("epoch")
	plt.ylabel("difference")
	plt.title("Recall 差值图")
	plt.legend()
	plt.grid(True, alpha=0.3)
	plt.tight_layout()
	plt.show()

	plt.figure(figsize=(10, 4))
	plt.plot(x_50, diff_50, marker="o", linewidth=2, label="YOLOv8 - YOLOv5")
	plt.axhline(0, color="gray", linestyle="--", linewidth=1)
	plt.xlabel("epoch")
	plt.ylabel("difference")
	plt.title("mAP50 差值图")
	plt.legend()
	plt.grid(True, alpha=0.3)
	plt.tight_layout()
	plt.show()

	plt.figure(figsize=(10, 4))
	plt.plot(x_5095, diff_5095, marker="o", linewidth=2, label="YOLOv8 - YOLOv5")
	plt.axhline(0, color="gray", linestyle="--", linewidth=1)
	plt.xlabel("epoch")
	plt.ylabel("difference")
	plt.title("mAP50-95 差值图")
	plt.legend()
	plt.grid(True, alpha=0.3)
	plt.tight_layout()
	plt.show()

	print("Recall 最后一个 epoch:")
	print(f"  YOLOv5: {y5_recall[-1]:.4f}")
	print(f"  YOLOv8: {y8_recall[-1]:.4f}")
	print("mAP50 最后一个 epoch:")
	print(f"  YOLOv5: {y5_50[-1]:.4f}")
	print(f"  YOLOv8: {y8_50[-1]:.4f}")
	print("mAP50-95 最后一个 epoch:")
	print(f"  YOLOv5: {y5_5095[-1]:.4f}")
	print(f"  YOLOv8: {y8_5095[-1]:.4f}")


if __name__ == "__main__":
	main()
csv