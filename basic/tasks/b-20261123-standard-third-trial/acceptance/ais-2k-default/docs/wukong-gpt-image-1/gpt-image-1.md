# OpenAI 图像编辑接口（gpt-image-1）

**请求方式：** `POST`  
**接口地址：** `https://api.wukong.support/v1/images/edits`  
**官方文档：** [OpenAI API Reference](https://platform.openai.com/docs/api-reference/images/createEdit)  

---

### 一、请求参数

#### 1. Header 参数

| 参数名         | 类型    | 是否必需 | 示例值                  | 说明                     |
| -------------- | ------- | -------- | ----------------------- | ------------------------ |
| Authorization  | string  | ✅       | Bearer {{YOUR_API_KEY}} | API密钥，需加 Bearer 前缀 |

#### 2. Body 参数（`multipart/form-data`）

| 参数名         | 类型                  | 是否必需 | 说明                                                         |
| -------------- | --------------------- | -------- | ------------------------------------------------------------ |
| image          | file 或 file array    | ✅       | 要编辑的图片，支持 PNG、WEBP、JPG 格式，每张 <25MB。         |
| prompt         | string                | ✅       | 期望图像的描述。<br>gpt-image-1: 最长32000字符。             |
| mask           | file                  | 可选     | PNG蒙版图片，透明区（alpha=0）表示待编辑区域，需与image尺寸一致，<4MB。仅对第一张图片有效。 |
| model          | string                | 可选     | 使用的模型：`dall-e-2` 或 `gpt-image-1`。<br>默认`dall-e-2`，如用gpt-image-1特有参数则自动切换。 |
| n              | integer 或 null       | 可选     | 生成图片数量，1~10，默认1。                                   |
| quality        | string 或 null        | 可选     | gpt-image-1专用：`high`、`medium`、`low`，默认`auto`。        |
| response_format| string 或 null        | 可选     | 返回格式：`url` 或 `b64_json`。仅dall-e-2支持`url`。          |
| size           | string 或 null        | 可选     | 图片尺寸：<ul><li>gpt-image-1: "1024x1024", "1536x1024", "1024x1536", "auto"(默认)</li><li>dall-e-2: "256x256", "512x512", "1024x1024"</li></ul> |

---

### 二、参数示例

#### Header

```http
Authorization: Bearer {{YOUR_API_KEY}}
```

#### Body (multipart/form-data)

| 参数   | 示例值                                    |
| ------ | ----------------------------------------- |
| image  | E:\Desktop\gpt\icon_samll2.png            |
| prompt | 带上眼镜                                  |
| model  | gpt-image-1                               |

---

### 三、示例代码（Python Requests）

```python
import http.client
import mimetypes
from codecs import encode

conn = http.client.HTTPSConnection("{{BASE_URL}}")
dataList = []
boundary = 'wL36Yn8afVp8Ag7AmP8qZ0SA4n1v9T'
dataList.append(encode('--' + boundary))
dataList.append(encode('Content-Disposition: form-data; name=image; filename={0}'.format('E:\\\\Desktop\\\\gpt\\\\icon_samll2.png')))

fileType = mimetypes.guess_type('E:\\\\Desktop\\\\gpt\\\\icon_samll2.png')[0] or 'application/octet-stream'
dataList.append(encode('Content-Type: {}'.format(fileType)))
dataList.append(encode(''))

with open('E:\\Desktop\\gpt\\icon_samll2.png', 'rb') as f:
   dataList.append(f.read())
dataList.append(encode('--' + boundary))
dataList.append(encode('Content-Disposition: form-data; name=prompt;'))

dataList.append(encode('Content-Type: {}'.format('text/plain')))
dataList.append(encode(''))

dataList.append(encode("带上眼镜"))
dataList.append(encode('--' + boundary))
dataList.append(encode('Content-Disposition: form-data; name=model;'))

dataList.append(encode('Content-Type: {}'.format('text/plain')))
dataList.append(encode(''))

dataList.append(encode("gpt-image-1"))
dataList.append(encode('--'+boundary+'--'))
dataList.append(encode(''))
body = b'\r\n'.join(dataList)
payload = body
headers = {
   'Authorization': 'Bearer {{YOUR_API_KEY}}',
   'Content-type': 'multipart/form-data; boundary={}'.format(boundary)
}
conn.request("POST", "/v1/images/edits", payload, headers)
res = conn.getresponse()
data = res.read()
print(data.decode("utf-8"))
```

---

### 四、响应示例

**HTTP 200 成功**

```json
{
    "created": 1713833628,
    "data": [
        {
            "b64_json": "..."
        }
    ],
    "usage": {
        "total_tokens": 100,
        "input_tokens": 50,
        "output_tokens": 50,
        "input_tokens_details": {
            "text_tokens": 10,
            "image_tokens": 40
        }
    }
}
```

---

**说明：**
- `b64_json` 字段为 base64 编码的图片内容。
- 若选择 `response_format` 为 `url`，则返回 `url` 字段，图片有效期60分钟（仅支持dall-e-2）。
- `usage` 部分显示本次请求的 Token 统计信息。

---

如需进一步使用或集成，建议参考[官方文档](https://platform.openai.com/docs/api-reference/images/createEdit)。
