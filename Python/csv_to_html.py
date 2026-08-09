import csv
import sys
import os


def csv_to_html(csv_path, html_path=None):
    if html_path is None:
        html_path = os.path.splitext(csv_path)[0] + '.html'

    colors = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if row:
                colors.append(row[0])

    lines = []
    lines.append('<!DOCTYPE html>')
    lines.append('<html><head><meta charset="utf-8">')
    lines.append(f'<title>{os.path.basename(csv_path)}</title>')
    lines.append('<style>')
    lines.append('body { font-family: monospace; padding: 20px; }')
    lines.append('.container { display: flex; flex-wrap: wrap; gap: 12px; }')
    lines.append('.item { display: flex; align-items: center; padding: 8px 12px; background: #f5f5f5; border-radius: 6px; border: 1px solid #e0e0e0; }')
    lines.append('.swatch { width: 24px; height: 24px; margin-right: 8px; border: 1px solid #999; border-radius: 3px; }')
    lines.append('</style>')
    lines.append('</head><body>')
    lines.append('<div class="container">')

    for color in colors:
        lines.append(f'<div class="item"><div class="swatch" style="background:{color}"></div><span>{color}</span></div>')

    lines.append('</div>')
    lines.append('</body></html>')

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'已生成: {html_path} ({len(colors)} 种颜色)')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        csv_file = input('请输入CSV文件路径: ').strip().strip('"')
    else:
        csv_file = sys.argv[1]

    if not os.path.isfile(csv_file):
        print(f'文件不存在: {csv_file}')
        sys.exit(1)

    html_file = None
    if len(sys.argv) >= 3:
        html_file = sys.argv[2]

    csv_to_html(csv_file, html_file)