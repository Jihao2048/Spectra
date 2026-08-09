import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from PIL import Image, ImageTk, ImageFile
import os
import json
from collections import defaultdict
import threading
import time
import math
import numpy as np
import ctypes

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

FONT_NAME = '华文仿宋'

ImageFile.LOAD_TRUNCATED_IMAGES = True
Image.MAX_IMAGE_PIXELS = None

class ColorExtractorGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("像素颜色提取工具")
        self.root.geometry("1000x800")
        self.root.resizable(True, True)
        
        style = ttk.Style()
        style.theme_use('default')
        
        self.image_path = tk.StringVar()
        self.output_format = tk.StringVar(value='text')
        self.group_tolerance = tk.IntVar(value=12)
        self.show_group_details = tk.BooleanVar(value=False)
        self.is_processing = False
        
        self.color_data = None
        self.grouped_data = None
        self.total_pixels = 0
        self.transparent_pixel_count = 0
        self.image_info = {}
        self.original_color_count = 0
        
        self.create_widgets()
    
    def create_widgets(self):
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        
        title_label = ttk.Label(main_frame, text="像素颜色提取工具", 
                               font=(FONT_NAME, 16, 'bold'))
        title_label.grid(row=0, column=0, pady=(0, 10), sticky=tk.W)
        
        file_frame = ttk.LabelFrame(main_frame, text="选择文件", padding="10")
        file_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        file_frame.columnconfigure(1, weight=1)
        
        ttk.Label(file_frame, text="图片文件:").grid(row=0, column=0, sticky=tk.W, padx=(0, 10))
        
        self.file_entry = ttk.Entry(file_frame, textvariable=self.image_path, state='readonly')
        self.file_entry.grid(row=0, column=1, sticky=(tk.W, tk.E), padx=(0, 10))
        
        ttk.Button(file_frame, text="浏览...", command=self.browse_file).grid(row=0, column=2)
        
        self.info_label = ttk.Label(main_frame, text="")
        self.info_label.grid(row=2, column=0, sticky=tk.W, pady=(0, 10))
        
        preview_options_frame = ttk.Frame(main_frame)
        preview_options_frame.grid(row=3, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        preview_options_frame.columnconfigure(0, weight=0)
        preview_options_frame.columnconfigure(1, weight=1)
        
        preview_frame = ttk.LabelFrame(preview_options_frame, text="图片预览（缩略图）", padding="10")
        preview_frame.grid(row=0, column=0, sticky=(tk.W, tk.N, tk.S), padx=(0, 10))
        
        self.preview_label = ttk.Label(preview_frame, text="请选择PNG图片\n（大图片将自动缩放预览）")
        self.preview_label.grid(row=0, column=0)
        
        options_frame = ttk.LabelFrame(preview_options_frame, text="选项设置", padding="10")
        options_frame.grid(row=0, column=1, sticky=(tk.W, tk.E, tk.N, tk.S))
        options_frame.columnconfigure(0, weight=1)
        
        options_row3 = ttk.Frame(options_frame)
        options_row3.grid(row=0, column=0, sticky=tk.W, pady=(0, 5))
        
        ttk.Label(options_row3, text="容差档位(0=不启用):").pack(side=tk.LEFT, padx=(0, 5))

        self.tolerance_scale = ttk.Scale(options_row3, from_=0, to=50,
                                        variable=self.group_tolerance, orient=tk.HORIZONTAL, length=150,
                                        command=self.on_tolerance_change)
        self.tolerance_scale.pack(side=tk.LEFT, padx=(0, 10))

        self.tolerance_label = ttk.Label(options_row3, text="细致(12.5)", width=16)
        self.tolerance_label.pack(side=tk.LEFT, padx=(0, 20))
        
        options_row4 = ttk.Frame(options_frame)
        options_row4.grid(row=1, column=0, sticky=tk.W, pady=(5, 0))
        
        ttk.Checkbutton(options_row4, text="导出时显示分组详情", 
                       variable=self.show_group_details).pack(side=tk.LEFT, padx=(0, 30))
        
        ttk.Label(options_row4, text="输出格式:").pack(side=tk.LEFT, padx=(0, 10))
        
        format_combo = ttk.Combobox(options_row4, textvariable=self.output_format,
                                   values=['text', 'json', 'csv'], state='readonly', width=10)
        format_combo.pack(side=tk.LEFT)
        
        ttk.Label(options_row4, text="  ").pack(side=tk.LEFT)
        
        self.process_btn = ttk.Button(options_row4, text="开始提取", 
                                     command=self.start_extraction, width=15)
        self.process_btn.pack(side=tk.LEFT)
        
        ttk.Button(options_row4, text="导出结果", 
                  command=self.export_results, width=15).pack(side=tk.LEFT, padx=(10, 0))
        
        ttk.Button(options_row4, text="停止", 
                  command=self.stop_processing, width=10).pack(side=tk.LEFT, padx=(10, 0))
        
        self.progress_bar = ttk.Progressbar(main_frame, mode='determinate', maximum=100)
        self.progress_bar.grid(row=4, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        self.progress_bar.grid_remove()
        
        stats_frame = ttk.Frame(main_frame)
        stats_frame.grid(row=5, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        
        self.stats_label = ttk.Label(stats_frame, text="就绪")
        self.stats_label.pack(side=tk.LEFT)
        
        self.time_label = ttk.Label(stats_frame, text="")
        self.time_label.pack(side=tk.RIGHT)
        
        result_frame = ttk.LabelFrame(main_frame, text="提取结果", padding="10")
        result_frame.grid(row=6, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(0, 10))
        result_frame.columnconfigure(0, weight=1)
        result_frame.rowconfigure(0, weight=1)
        
        self.result_text = scrolledtext.ScrolledText(
            result_frame, 
            wrap=tk.WORD,
            font=(FONT_NAME, 10),
            height=18
        )
        self.result_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        main_frame.rowconfigure(6, weight=1)
        
        self.should_stop = False
    
    def on_tolerance_change(self, value=None):
        tolerance_levels = [0, 12, 25, 38, 50]
        display_names = {
            0: "仅分组完全相同颜色(0)",
            12: "细致(12.5)",
            25: "中等(25)",
            38: "粗糙(37.5)",
            50: "最少(50)"
        }
        
        raw_val = float(value) if value is not None else float(self.group_tolerance.get())
        
        closest = min(tolerance_levels, key=lambda x: abs(x - raw_val))
        self.group_tolerance.set(closest)
        self.tolerance_label.config(text=display_names[closest])
    
    def browse_file(self):
        filetypes = [
            ("PNG图片", "*.png *.PNG"),
            ("所有图片", "*.png *.jpg *.jpeg *.bmp *.gif *.PNG *.JPG *.JPEG *.BMP *.GIF"),
            ("所有文件", "*.*")
        ]
        
        filename = filedialog.askopenfilename(
            title="选择图片（支持超大PNG）",
            filetypes=filetypes
        )
        
        if filename:
            self.image_path.set(filename)
            self.show_preview(filename)
    
    def show_preview(self, image_path):

        try:
            with Image.open(image_path) as img:
                width, height = img.size
                mode = img.mode
                file_size = os.path.getsize(image_path) / (1024**3)
                
                info_text = f"图片: {os.path.basename(image_path)} | "
                info_text += f"尺寸: {width:,}x{height:,} ({width*height:,} 像素) | "
                info_text += f"模式: {mode} | "
                info_text += f"文件大小: {file_size:.2f} GB"
                
                self.info_label.config(text=info_text)
                self.image_info = {
                    'width': width,
                    'height': height,
                    'mode': mode,
                    'size': file_size
                }
                
                preview_img = img.copy()
                max_preview_size = (400, 300)
                preview_img.thumbnail(max_preview_size, Image.Resampling.LANCZOS)
                
                photo = ImageTk.PhotoImage(preview_img)
                self.preview_label.config(image=photo)
                self.preview_label.image = photo
                
        except Exception as e:
            messagebox.showerror("错误", f"无法预览图片: {str(e)}")
    
    def hex_to_rgb(self, hex_color):
        hex_color = hex_color.lstrip('#')
        if len(hex_color) == 6:
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        elif len(hex_color) == 8:
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4, 6))
        return (0, 0, 0)
    
    def color_distance(self, c1, c2):
        if len(c1) != len(c2):
            return float('inf')
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))
    
    def group_colors_by_similarity(self, color_count, tolerance=15):
        if not color_count:
            return {}
        
        colors = []
        for color, count in color_count.items():
            rgb = self.hex_to_rgb(color)
            colors.append((rgb, color, count))
        
        colors.sort(key=lambda x: x[2], reverse=True)
        
        groups = []
        processed = set()
        
        for idx, (rgb, color, count) in enumerate(colors):
            if color in processed:
                continue
            
            group_colors = [color]
            group_count = count
            processed.add(color)
            
            for rgb2, color2, count2 in colors[idx+1:]:
                if color2 in processed:
                    continue
                
                dist = self.color_distance(rgb, rgb2)
                if dist <= tolerance:
                    group_colors.append(color2)
                    group_count += count2
                    processed.add(color2)
            
            rep_color = group_colors[0]
            groups.append({
                'representative': rep_color,
                'colors': group_colors,
                'count': group_count,
                'color_count': len(group_colors)
            })

        grouped_result = {}
        for group in groups:
            rep = group['representative']
            grouped_result[rep] = {
                'count': group['count'],
                'colors': group['colors'],
                'color_count': group['color_count']
            }
        
        return grouped_result
    
    def start_extraction(self):
        if not self.image_path.get():
            messagebox.showwarning("警告", "请先选择图片文件！")
            return
        
        if self.is_processing:
            messagebox.showinfo("提示", "正在处理中，请稍候...")
            return
        
        self.result_text.delete(1.0, tk.END)
        self.result_text.insert(tk.END, "正在提取像素颜色，请稍候...\n")
        self.result_text.see(tk.END)
        
        self.process_btn.config(state='disabled')
        self.is_processing = True
        self.should_stop = False
        
        self.progress_bar.grid()
        self.progress_bar['value'] = 0

        thread = threading.Thread(target=self.do_extraction, daemon=True)
        thread.start()
    
    def do_extraction(self):
        start_time = time.time()
        try:
            img_path = self.image_path.get()
            tolerance = self.group_tolerance.get()
            
            color_count, total_pixels, transparent_count, sampled = self.extract_pixel_colors_optimized(
                img_path
            )
            
            self.color_data = color_count
            self.total_pixels = total_pixels
            self.transparent_pixel_count = transparent_count
            self.original_color_count = len(color_count)

            if tolerance > 0 and len(color_count) > 10:
                self.result_text.insert(tk.END, f"\n正在对 {len(color_count)} 种颜色进行相似度分组...\n")
                self.result_text.see(tk.END)
                
                grouped = self.group_colors_by_similarity(
                    color_count, 
                    tolerance=tolerance
                )
                self.grouped_data = grouped
            else:
                self.grouped_data = None
            
            elapsed_time = time.time() - start_time

            self.root.after(0, self.update_results, color_count, total_pixels, 
                          sampled, elapsed_time)
            
        except Exception as e:
            self.root.after(0, self.show_error, str(e))
        finally:
            self.root.after(0, self.finish_processing)
    
    def extract_pixel_colors_optimized(self, image_path):
        img = Image.open(image_path)
        img = img.convert('RGBA')
        width, height = img.size
        
        pixels = img.load()
        total_pixels = 0
        transparent_count = 0
        color_count = defaultdict(int)
        total = width * height
        last_update = 0
        
        for y in range(height):
            if self.should_stop:
                raise Exception("用户中止处理")
            
            for x in range(width):
                r, g, b, a = pixels[x, y]
                
                if a == 0:
                    transparent_count += 1
                    continue
                
                total_pixels += 1
                
                hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)
                
                color_count[hex_color] += 1
            
            current = (y + 1) * width
            progress = int((current / total) * 100)
            if progress >= last_update + 2:
                last_update = progress
                self.root.after(0, self.update_progress, progress)
        
        return dict(color_count), total_pixels, transparent_count, False
    
    def update_progress(self, progress):
        self.progress_bar['value'] = min(100, progress)
        self.stats_label.config(text=f"处理中... {progress}%")
        self.root.update_idletasks()
    
    def update_results(self, color_count, total_pixels, sampled, elapsed_time):
        result_lines = []
        result_lines.append("=" * 85)
        result_lines.append(f"处理完成！耗时: {elapsed_time:.2f} 秒")
        result_lines.append(f"统计像素数: {total_pixels:,}")
        if self.transparent_pixel_count > 0:
            result_lines.append(f"透明像素数: {self.transparent_pixel_count:,}（已丢弃）")
        result_lines.append(f"原始颜色数量: {len(color_count):,}")
        
        if self.grouped_data:
            result_lines.append(f"分组后颜色组数: {len(self.grouped_data)}")
            result_lines.append(f"相似度容差: {self.group_tolerance.get()}")
            result_lines.append("=" * 85)
            result_lines.append("【颜色分组结果 - 代表色】")
            result_lines.append("")

            sorted_groups = sorted(self.grouped_data.items(), 
                                 key=lambda x: x[1]['count'], reverse=True)
            
            for i, (rep_color, group_info) in enumerate(sorted_groups[:200], 1):
                count = group_info['count']
                percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                color_count_in_group = group_info['color_count']
                
                result_lines.append(f"{i:3d}. {rep_color}  |  数量: {count:>10,}  |  占比: {percentage:>6.2f}%  |  合并颜色数: {color_count_in_group}")
            
            if len(sorted_groups) > 200:
                result_lines.append(f"\n... 共 {len(sorted_groups)} 组，仅显示前200组")
            
            result_lines.append("=" * 85)
        else:
            result_lines.append("=" * 85)
            result_lines.append("【颜色列表】")
            result_lines.append("")
            result_lines.append(f"{'序号':<6} {'颜色(十六进制)':<20} {'数量':<12} {'占比':<12}")
            result_lines.append("-" * 85)
            
            sorted_colors = sorted(color_count.items(), key=lambda x: x[1], reverse=True)
            display_limit = 500 if len(sorted_colors) <= 500 else 100
            
            for i in range(min(display_limit, len(sorted_colors))):
                color, count = sorted_colors[i]
                percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                result_lines.append(f"{i+1:<6} {color:<20} {count:<12} {percentage:>6.2f}%")
            
            if len(sorted_colors) > display_limit:
                result_lines.append(f"... (共{len(sorted_colors)}种颜色，仅显示前{display_limit}种)")
            
            result_lines.append("=" * 85)
        
        self.result_text.delete(1.0, tk.END)
        self.result_text.insert(1.0, '\n'.join(result_lines))
        self.result_text.see(1.0)
        
        if self.grouped_data:
            stats_text = f"✅ 完成！{total_pixels:,} 像素，{len(color_count):,} 种颜色 → 合并为 {len(self.grouped_data)} 组"
        else:
            stats_text = f"✅ 完成！共 {total_pixels:,} 个像素，{len(color_count):,} 种颜色"
        
        self.stats_label.config(text=stats_text)
        self.time_label.config(text=f"耗时: {elapsed_time:.2f}s")
    
    def show_error(self, error_msg):
        if "用户中止" in error_msg:
            self.stats_label.config(text="⏹ 已停止处理")
            self.result_text.insert(tk.END, "\n\n用户已停止处理")
        else:
            messagebox.showerror("错误", f"提取失败: {error_msg}")
            self.result_text.delete(1.0, tk.END)
            self.result_text.insert(1.0, f"错误: {error_msg}")
    
    def finish_processing(self):

        self.is_processing = False
        self.process_btn.config(state='normal')
        self.progress_bar.grid_remove()
    
    def stop_processing(self):
        if self.is_processing:
            self.should_stop = True
            self.stats_label.config(text="正在停止处理...")
    
    def export_results(self):
        if not self.color_data:
            messagebox.showwarning("警告", "请先提取颜色数据！")
            return
        
        filetypes = {}
        filetypes["text"] = ("文本文件", "*.txt")
        filetypes["json"] = ("JSON文件", "*.json")
        filetypes["csv"] = ("CSV文件", "*.csv")
        
        fmt = self.output_format.get()
        filetype = filetypes.get(fmt, ("所有文件", "*.*"))
        
        filename = filedialog.asksaveasfilename(
            title="保存结果",
            defaultextension=filetype[1],
            filetypes=[filetype]
        )
        
        if not filename:
            return
        
        try:
            color_count = self.color_data
            total_pixels = self.total_pixels
            grouped_data = self.grouped_data
            
            if fmt == 'json':
                if grouped_data:
                    results = []
                    sorted_groups = sorted(grouped_data.items(), 
                                         key=lambda x: x[1]['count'], reverse=True)
                    for rep_color, group_info in sorted_groups:
                        count = group_info['count']
                        percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                        
                        result_item = {
                            'color': rep_color,
                            'count': count,
                            'percentage': round(percentage, 4),
                            'merged_colors_count': group_info['color_count']
                        }
                        
                        if self.show_group_details.get():
                            result_item['merged_colors'] = group_info['colors']
                        
                        results.append(result_item)
                else:
                    results = []
                    sorted_colors = sorted(color_count.items(), key=lambda x: x[1], reverse=True)
                    for color, count in sorted_colors:
                        percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                        results.append({
                            'color': color,
                            'count': count,
                            'percentage': round(percentage, 4)
                        })
                
                output_data = {
                    'total_pixels': total_pixels,
                    'transparent_pixels': self.transparent_pixel_count,
                    'unique_colors': len(color_count) if not grouped_data else len(grouped_data),
                    'original_colors': len(color_count),
                    'image_info': self.image_info,
                    'grouping_enabled': bool(grouped_data),
                    'colors': results
                }
                
                if grouped_data:
                    output_data['group_tolerance'] = self.group_tolerance.get()
                
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(output_data, f, indent=2, ensure_ascii=False)
            
            elif fmt == 'csv':
                import csv
                with open(filename, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    
                    writer.writerow(['统计像素数', total_pixels])
                    if self.transparent_pixel_count > 0:
                        writer.writerow(['透明像素数(已丢弃)', self.transparent_pixel_count])
                    
                    if grouped_data:
                        writer.writerow(['颜色(十六进制)', '数量', '百分比(%)', '合并颜色数'])
                        sorted_groups = sorted(grouped_data.items(), 
                                             key=lambda x: x[1]['count'], reverse=True)
                        for rep_color, group_info in sorted_groups:
                            count = group_info['count']
                            percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                            writer.writerow([
                                rep_color, 
                                count, 
                                f'{percentage:.4f}',
                                group_info['color_count']
                            ])
                    else:
                        writer.writerow(['颜色(十六进制)', '数量', '百分比(%)'])
                        sorted_colors = sorted(color_count.items(), key=lambda x: x[1], reverse=True)
                        for color, count in sorted_colors:
                            percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                            writer.writerow([color, count, f'{percentage:.4f}'])
            
            else:
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(f"图片信息: {os.path.basename(self.image_path.get())}\n")
                    f.write(f"尺寸: {self.image_info.get('width', '?')}x{self.image_info.get('height', '?')}\n")
                    f.write(f"统计像素数: {total_pixels:,}\n")
                    if self.transparent_pixel_count > 0:
                        f.write(f"透明像素数: {self.transparent_pixel_count:,}（已丢弃）\n")
                    f.write(f"原始颜色数量: {len(color_count):,}\n")
                    
                    if grouped_data:
                        f.write(f"分组后颜色组数: {len(grouped_data)}\n")
                        f.write(f"相似度容差: {self.group_tolerance.get()}\n")
                        f.write("\n")
                        f.write("【颜色分组结果 - 代表色】\n")
                        f.write("\n")
                        
                        sorted_groups = sorted(grouped_data.items(), 
                                             key=lambda x: x[1]['count'], reverse=True)
                        for i, (rep_color, group_info) in enumerate(sorted_groups, 1):
                            count = group_info['count']
                            percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                            f.write(f"{i}  {rep_color}  数量: {count:,}  占比: {percentage:.2f}%  合并颜色数: {group_info['color_count']}\n")
                            
                            if self.show_group_details.get() and len(group_info['colors']) > 1:
                                f.write(f"      合并颜色: {', '.join(group_info['colors'][:20])}\n")
                                if len(group_info['colors']) > 20:
                                    f.write(f"      ... 还有 {len(group_info['colors']) - 20} 种\n")
                    else:
                        f.write("\n")
                        f.write("【颜色列表】\n")
                        f.write("\n")
                        
                        sorted_colors = sorted(color_count.items(), key=lambda x: x[1], reverse=True)
                        for i, (color, count) in enumerate(sorted_colors, 1):
                            percentage = (count / total_pixels * 100) if total_pixels > 0 else 0
                            f.write(f"{i}  {color}  数量: {count:,}  占比: {percentage:.2f}%\n")
            
            messagebox.showinfo("成功", f"结果已导出到: {filename}")
            
        except Exception as e:
            messagebox.showerror("错误", f"导出失败: {str(e)}")

def main():
    root = tk.Tk()
    app = ColorExtractorGUI(root)
    

    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f'{width}x{height}+{x}+{y}')
    
    root.mainloop()

if __name__ == '__main__':
    main()